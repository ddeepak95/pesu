/**
 * Shared library for the class backup / delete / restore scripts.
 * See dev-docs/class-backup-and-deletion-plan.md.
 *
 * Everything class-scoped is described by TABLE_SPECS: one entry per table with
 * its primary key (for de-dup + upsert) and the clause(s) that select this
 * class's rows. A table matches the UNION of its clauses (pseudo-FK columns are
 * nullable and sometimes populated late, so we OR across every known linking
 * column and de-duplicate by PK).
 */
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "crypto";
import { createReadStream, existsSync, readFileSync } from "fs";
import { readdir } from "fs/promises";
import { join, relative, resolve } from "path";
import { getStorageBucket } from "../../src/lib/firebase-admin";

// ---------------------------------------------------------------------------
// Env & clients
// ---------------------------------------------------------------------------

export type TargetEnv = "prod" | "local";

export function loadEnvLocal(): void {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

export interface Target {
  env: TargetEnv;
  url: string;
  serviceKey: string;
  bucketName: string;
}

export function resolveTarget(env: TargetEnv): Target {
  const url =
    env === "local"
      ? process.env.NEXT_PUBLIC_SUPABASE_LOCAL_URL?.trim()
      : process.env.NEXT_PUBLIC_SUPABASE_PROD_URL?.trim();
  const serviceKey =
    env === "local"
      ? process.env.SUPABASE_LOCAL_SERVICE_ROLE_KEY?.trim()
      : process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const bucketName = process.env.FIREBASE_STORAGE_BUCKET?.trim();
  if (!url) throw new Error(`Supabase URL env var for --env ${env} is not set`);
  if (!serviceKey) throw new Error(`Supabase service role key for --env ${env} is not set`);
  if (!bucketName) throw new Error("FIREBASE_STORAGE_BUCKET is not set");
  return { env, url, serviceKey, bucketName };
}

export function createServiceClient(target: Target): SupabaseClient {
  return createClient(target.url, target.serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function getBucket() {
  return getStorageBucket();
}

/** Red banner + countdown before mutating a PROD target. */
export async function prodGuard(target: Target, action: string): Promise<void> {
  console.log(`\nTarget DB:     ${target.url}`);
  console.log(`Target bucket: ${target.bucketName}`);
  if (target.env !== "prod") return;
  const red = (s: string) => `\x1b[41m\x1b[97m${s}\x1b[0m`;
  console.log(red(`\n  *** PROD TARGET — about to ${action} ***  `));
  for (let i = 5; i > 0; i--) {
    process.stdout.write(`  continuing in ${i}s... (Ctrl+C to abort)\r`);
    await new Promise((r) => setTimeout(r, 1000));
  }
  console.log("\n");
}

// ---------------------------------------------------------------------------
// ID closure
// ---------------------------------------------------------------------------

export interface ClassClosure {
  classUuid: string;
  classTextId: string;
  institutionId: string | null;
  assignmentIds: string[]; // assignments.assignment_id (text)
  quizIds: string[]; // quizzes.id (uuid)
  surveyIds: string[]; // surveys.id (uuid)
  contentItemIds: string[]; // content_items.id (uuid)
  submissionIds: string[]; // submissions.submission_id (text)
  submissionQuestionIds: string[]; // submission_questions.id (uuid)
  attemptIds: string[]; // submission_attempts.id (uuid)
  chatMessageIds: string[]; // chat_messages.id (uuid)
  invocationIds: string[]; // ai_invocations.id (uuid)
  walletIds: string[]; // ai_credit_wallets.id (uuid, class wallets only)
}

export const PAGE_SIZE = 1000;
export const IN_CHUNK = 100;

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Tables that turned out not to exist in the target schema (e.g. migrations on
 * this branch not yet deployed). Selects/deletes against them are treated as
 * empty; backup records them in the manifest.
 */
export const missingTables = new Set<string>();

function isMissingTableError(error: { code?: string; message: string }): boolean {
  return error.code === "PGRST205" || /could not find the table/i.test(error.message);
}

/** The PostgREST error shape these scripts inspect. */
type PgError = { code?: string; message: string };

/**
 * The chainable PostgREST filter methods used across these scripts, generic
 * over the concrete builder type so the same helper works on both `.select()`
 * and `.delete()` builders (each returns itself from a filter call).
 */
interface Filterable<Q> {
  eq(column: string, value: unknown): Q;
  in(column: string, values: readonly unknown[]): Q;
  like(column: string, pattern: string): Q;
}

/** A `.select()` builder: filterable, orderable, range-paginated, awaitable. */
interface SelectQuery extends Filterable<SelectQuery> {
  order(column: string, opts: { ascending: boolean }): SelectQuery;
  range(
    from: number,
    to: number,
  ): PromiseLike<{ data: Record<string, unknown>[] | null; error: PgError | null }>;
}

function noteMissingTable(table: string): void {
  if (!missingTables.has(table)) {
    missingTables.add(table);
    console.warn(`  ! table ${table} does not exist in target schema — treating as empty (migration not deployed?)`);
  }
}

async function pagedSelect(
  supabase: SupabaseClient,
  table: string,
  columns: string,
  apply: (q: SelectQuery) => SelectQuery,
  orderCols?: string[]
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  if (missingTables.has(table)) return rows;
  // .range() pagination without ORDER BY is unstable (Postgres gives no order
  // guarantee across executions), which silently skips/duplicates rows once a
  // result exceeds PAGE_SIZE — always paginate over a unique ordering.
  const order =
    orderCols ??
    (columns === "*" ? [] : columns.split(",").map((c) => c.trim()).filter(Boolean));
  if (order.length === 0)
    throw new Error(`pagedSelect(${table}): stable pagination requires explicit order columns`);
  for (let from = 0; ; from += PAGE_SIZE) {
    let q = supabase.from(table).select(columns) as unknown as SelectQuery;
    q = apply(q);
    for (const col of order) q = q.order(col, { ascending: true });
    const { data, error } = await q.range(from, from + PAGE_SIZE - 1);
    if (error) {
      if (isMissingTableError(error)) {
        noteMissingTable(table);
        return rows;
      }
      throw new Error(`select ${table} failed: ${error.message}`);
    }
    if (!data || data.length === 0) break;
    rows.push(...(data as unknown as Record<string, unknown>[]));
    if (data.length < PAGE_SIZE) break;
  }
  return rows;
}

/** Select `column` values where inColumn IN parentIds (chunked + paginated). */
async function collectChildIds(
  supabase: SupabaseClient,
  table: string,
  column: string,
  inColumn: string,
  parentIds: string[]
): Promise<string[]> {
  const out = new Set<string>();
  for (const part of chunk(parentIds, IN_CHUNK)) {
    const rows = await pagedSelect(supabase, table, column, (q) => q.in(inColumn, part));
    for (const r of rows) {
      const v = r[column];
      if (v != null) out.add(String(v));
    }
  }
  return [...out];
}

export async function resolveClass(
  supabase: SupabaseClient,
  classInput: string
): Promise<{ id: string; class_id: string; name: string; institution_id: string | null } | null> {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(classInput);
  const { data, error } = await supabase
    .from("classes")
    .select("id, class_id, name, institution_id")
    .eq(isUuid ? "id" : "class_id", classInput)
    .maybeSingle();
  if (error) throw new Error(`resolve class failed: ${error.message}`);
  return data as { id: string; class_id: string; name: string; institution_id: string | null } | null;
}

export async function buildClosure(
  supabase: SupabaseClient,
  cls: { id: string; class_id: string; institution_id: string | null }
): Promise<ClassClosure> {
  const classUuid = cls.id;
  const eqClass = (q: SelectQuery) => q.eq("class_id", classUuid);

  const assignments = await pagedSelect(supabase, "assignments", "assignment_id", eqClass);
  const assignmentIds = [...new Set(assignments.map((r) => String(r.assignment_id)))];

  const quizzes = await pagedSelect(supabase, "quizzes", "id", eqClass);
  const quizIds = quizzes.map((r) => String(r.id));

  const surveys = await pagedSelect(supabase, "surveys", "id", eqClass);
  const surveyIds = surveys.map((r) => String(r.id));

  const contentItems = await pagedSelect(supabase, "content_items", "id", eqClass);
  const contentItemIds = contentItems.map((r) => String(r.id));

  const submissionIds = await collectChildIds(
    supabase, "submissions", "submission_id", "assignment_id", assignmentIds
  );

  const submissionQuestionIds = await collectChildIds(
    supabase, "submission_questions", "id", "submission_id", submissionIds
  );

  const attemptIds = await collectChildIds(
    supabase, "submission_attempts", "id", "submission_question_id", submissionQuestionIds
  );

  // chat_messages reachable via submission_id OR assignment_id
  const chatIds = new Set<string>();
  for (const [col, ids] of [
    ["submission_id", submissionIds],
    ["assignment_id", assignmentIds],
  ] as const) {
    for (const id of await collectChildIds(supabase, "chat_messages", "id", col, ids)) {
      chatIds.add(id);
    }
  }
  const chatMessageIds = [...chatIds];

  // ai_invocations reachable via class_id OR assignment_id OR submission_id
  const invIds = new Set<string>();
  const direct = await pagedSelect(supabase, "ai_invocations", "id", eqClass);
  for (const r of direct) invIds.add(String(r.id));
  for (const [col, ids] of [
    ["assignment_id", assignmentIds],
    ["submission_id", submissionIds],
  ] as const) {
    for (const id of await collectChildIds(supabase, "ai_invocations", "id", col, ids)) {
      invIds.add(id);
    }
  }
  const invocationIds = [...invIds];

  // class wallets only — NEVER the class_id IS NULL institution pool
  const wallets = await pagedSelect(supabase, "ai_credit_wallets", "id", eqClass);
  const walletIds = wallets.map((r) => String(r.id));

  return {
    classUuid,
    classTextId: cls.class_id,
    institutionId: cls.institution_id,
    assignmentIds,
    quizIds,
    surveyIds,
    contentItemIds,
    submissionIds,
    submissionQuestionIds,
    attemptIds,
    chatMessageIds,
    invocationIds,
    walletIds,
  };
}

// ---------------------------------------------------------------------------
// Table manifest — clauses per table
// ---------------------------------------------------------------------------

export interface Clause {
  /** Fixed equality filters, ANDed (e.g. scope='class'). */
  eqs?: Array<{ column: string; value: string }>;
  /** One chunked IN filter. */
  in?: { column: string; values: string[] };
  /** One LIKE filter (student_notifications nav_path matching). */
  like?: { column: string; pattern: string };
}

export interface TableSpec {
  table: string;
  /** Primary key columns — de-dup key for unions, onConflict target for restore upserts. */
  pk: string[];
  clauses: (c: ClassClosure) => Clause[];
  /**
   * Rows matching column=value are NOT deleted explicitly: a DB trigger forbids
   * it while the classes row exists (class_teachers_prevent_owner_delete), and
   * the classes-row ON DELETE CASCADE removes them instead. Verification after
   * the classes delete still expects 0 rows.
   */
  deleteViaClassCascade?: { column: string; value: string };
}

const eqClassUuid = (c: ClassClosure): Clause[] => [
  { eqs: [{ column: "class_id", value: c.classUuid }] },
];
const scopeClass = (c: ClassClosure): Clause[] => [
  { eqs: [{ column: "scope", value: "class" }, { column: "scope_id", value: c.classUuid }] },
];
const bySubmission = (c: ClassClosure): Clause[] => [
  { in: { column: "submission_id", values: c.submissionIds } },
];
const bySubmissionOrAssignment = (c: ClassClosure): Clause[] => [
  { in: { column: "submission_id", values: c.submissionIds } },
  { in: { column: "assignment_id", values: c.assignmentIds } },
];

export const TABLE_SPECS: Record<string, TableSpec> = Object.fromEntries(
  (
    [
      { table: "classes", pk: ["id"], clauses: (c) => [{ eqs: [{ column: "id", value: c.classUuid }] }] },
      // Tier 1 — direct class_id (uuid)
      { table: "class_mandatory_fields", pk: ["id"], clauses: eqClassUuid },
      { table: "student_class_info", pk: ["id"], clauses: eqClassUuid },
      { table: "class_groups", pk: ["id"], clauses: eqClassUuid },
      { table: "class_group_memberships", pk: ["id"], clauses: eqClassUuid },
      { table: "class_institution_moves", pk: ["id"], clauses: eqClassUuid },
      { table: "class_student_invites", pk: ["id"], clauses: eqClassUuid },
      { table: "class_students", pk: ["id"], clauses: eqClassUuid },
      { table: "class_teacher_invites", pk: ["id"], clauses: eqClassUuid },
      {
        table: "class_teachers",
        pk: ["id"],
        clauses: eqClassUuid,
        deleteViaClassCascade: { column: "role", value: "owner" },
      },
      { table: "content_items", pk: ["id"], clauses: eqClassUuid },
      { table: "learning_contents", pk: ["id"], clauses: eqClassUuid },
      { table: "assignments", pk: ["id"], clauses: eqClassUuid },
      { table: "quizzes", pk: ["id"], clauses: eqClassUuid },
      { table: "surveys", pk: ["id"], clauses: eqClassUuid },
      {
        table: "quiz_submissions",
        pk: ["id"],
        clauses: (c) => [
          { eqs: [{ column: "class_id", value: c.classUuid }] },
          { in: { column: "quiz_id", values: c.quizIds } },
        ],
      },
      {
        table: "activity_events",
        pk: ["id"],
        clauses: (c) => [
          { eqs: [{ column: "class_id", value: c.classUuid }] },
          { in: { column: "submission_id", values: c.submissionIds } },
        ],
      },
      {
        table: "activity_logs",
        pk: ["id"],
        clauses: (c) => [
          { eqs: [{ column: "class_id", value: c.classUuid }] },
          { in: { column: "submission_id", values: c.submissionIds } },
        ],
      },
      {
        table: "ai_invocations",
        pk: ["id"],
        clauses: (c) => [
          { eqs: [{ column: "class_id", value: c.classUuid }] },
          { in: { column: "assignment_id", values: c.assignmentIds } },
          { in: { column: "submission_id", values: c.submissionIds } },
        ],
      },
      {
        table: "app_logs",
        pk: ["id"],
        clauses: (c) => [
          { eqs: [{ column: "class_id", value: c.classUuid }] },
          { in: { column: "activity_id", values: c.assignmentIds } },
          { in: { column: "submission_id", values: c.submissionIds } },
          { in: { column: "ai_invocation_id", values: c.invocationIds } },
        ],
      },
      { table: "ai_class_settings", pk: ["class_id"], clauses: eqClassUuid },
      // class rows only; the 0000… sentinel (institution rollup) never equals a real class uuid
      {
        table: "ai_usage_counters",
        pk: ["institution_id", "class_id", "key_source", "period_start", "usage_type"],
        clauses: eqClassUuid,
      },
      // class cap wallets only — clause is eq class_id so the NULL-class pool can never match
      { table: "ai_credit_wallets", pk: ["id"], clauses: eqClassUuid },
      // Tier 1b — scope-encoded (no FK to classes; would orphan silently if missed)
      { table: "setting_values", pk: ["scope", "scope_id", "key"], clauses: scopeClass },
      { table: "ai_provider_activations", pk: ["scope", "scope_id", "provider_id"], clauses: scopeClass },
      { table: "ai_function_bindings", pk: ["scope", "scope_id", "binding_key"], clauses: scopeClass },
      { table: "template_scope_enablement", pk: ["scope", "scope_id", "template_id"], clauses: scopeClass },
      {
        table: "activity_templates",
        pk: ["id"],
        clauses: (c) => [{ eqs: [{ column: "owner_class_id", value: c.classUuid }] }],
      },
      // Tier 2 — via assignment_id (text)
      {
        table: "submissions",
        pk: ["id"],
        clauses: (c) => [{ in: { column: "assignment_id", values: c.assignmentIds } }],
      },
      { table: "chat_messages", pk: ["id"], clauses: bySubmissionOrAssignment },
      { table: "voice_messages", pk: ["id"], clauses: bySubmissionOrAssignment },
      { table: "submission_files", pk: ["id"], clauses: bySubmissionOrAssignment },
      { table: "static_activity", pk: ["id"], clauses: bySubmissionOrAssignment },
      // Tier 2 — via quiz/survey/content_item
      {
        table: "survey_responses",
        pk: ["id"],
        clauses: (c) => [{ in: { column: "survey_id", values: c.surveyIds } }],
      },
      {
        table: "content_item_overrides",
        pk: ["id"],
        clauses: (c) => [{ in: { column: "content_item_id", values: c.contentItemIds } }],
      },
      {
        table: "student_content_completions",
        pk: ["id"],
        clauses: (c) => [{ in: { column: "content_item_id", values: c.contentItemIds } }],
      },
      {
        table: "teacher_content_unlocks",
        pk: ["id"],
        clauses: (c) => [{ in: { column: "content_item_id", values: c.contentItemIds } }],
      },
      // Tier 3 — via submission_id (text)
      { table: "submission_transcripts", pk: ["id"], clauses: bySubmission },
      {
        table: "submission_session_audio",
        pk: ["submission_id", "question_order", "attempt_number"],
        clauses: bySubmission,
      },
      { table: "submission_questions", pk: ["id"], clauses: bySubmission },
      { table: "attempt_sessions", pk: ["id"], clauses: bySubmission },
      {
        table: "chat_message_actions",
        pk: ["id"],
        clauses: (c) => [
          { in: { column: "submission_id", values: c.submissionIds } },
          { in: { column: "chat_message_id", values: c.chatMessageIds } },
        ],
      },
      // Tier 4 — via submission_question_id
      {
        table: "submission_attempts",
        pk: ["id"],
        clauses: (c) => [{ in: { column: "submission_question_id", values: c.submissionQuestionIds } }],
      },
      {
        table: "submission_question_reviews",
        pk: ["id"],
        clauses: (c) => [{ in: { column: "submission_question_id", values: c.submissionQuestionIds } }],
      },
      // Tier 5 — via attempt_id
      {
        table: "attempt_ai_evaluations",
        pk: ["id"],
        clauses: (c) => [{ in: { column: "attempt_id", values: c.attemptIds } }],
      },
      {
        table: "attempt_grade_drafts",
        pk: ["attempt_id"],
        clauses: (c) => [{ in: { column: "attempt_id", values: c.attemptIds } }],
      },
      // Wallet children
      {
        table: "ai_credit_transactions",
        pk: ["id"],
        clauses: (c) => [{ in: { column: "wallet_id", values: c.walletIds } }],
      },
      {
        table: "ai_credit_balances",
        pk: ["wallet_id"],
        clauses: (c) => [{ in: { column: "wallet_id", values: c.walletIds } }],
      },
      {
        table: "ai_credit_wallet_policy_audit",
        pk: ["id"],
        clauses: (c) => [{ in: { column: "wallet_id", values: c.walletIds } }],
      },
      // Special: class linkage only inside data jsonb. Confirmed shape
      // (src/lib/queries/notifications.ts): data = { nav_path, assignment_title } —
      // there is NO submission_id key. Conservative matcher: nav_path contains the
      // class text id as a path segment. Ambiguous rows are left alone by design.
      {
        table: "student_notifications",
        pk: ["id"],
        clauses: (c) => [{ like: { column: "data->>nav_path", pattern: `%${c.classTextId}%` } }],
      },
    ] as TableSpec[]
  ).map((s) => [s.table, s])
);

/** Leaf-first deletion order (plan §6). */
export const DELETION_ORDER: string[] = [
  // 1. wallet children
  "ai_credit_wallet_policy_audit",
  "ai_credit_balances",
  "ai_credit_transactions",
  // 2. attempt leaves
  "attempt_grade_drafts",
  "attempt_ai_evaluations",
  // 3. question leaves
  "submission_question_reviews",
  "submission_attempts",
  // 4.
  "submission_questions",
  // 5. session/message leaves
  "chat_message_actions",
  "submission_transcripts",
  "submission_session_audio",
  "attempt_sessions",
  // 6. (chat_messages before submissions is mandatory: real NO ACTION FK)
  "chat_messages",
  "voice_messages",
  "static_activity",
  "submission_files",
  // 7.
  "survey_responses",
  "quiz_submissions",
  // 8.
  "content_item_overrides",
  "student_content_completions",
  "teacher_content_unlocks",
  // 9.
  "submissions",
  // 10.
  "activity_events",
  "activity_logs",
  "app_logs",
  "ai_invocations",
  // 11.
  "student_notifications",
  // 12.
  "ai_usage_counters",
  "ai_credit_wallets",
  // 13.
  "content_items",
  "learning_contents",
  // 14.
  "assignments",
  "quizzes",
  "surveys",
  // 15. (memberships before groups: FK cascade would handle it, but stay explicit)
  "class_group_memberships",
  "class_groups",
  "class_students",
  "class_teachers",
  "class_student_invites",
  "class_teacher_invites",
  "class_mandatory_fields",
  "student_class_info",
  "class_institution_moves",
  // 16. (activity_templates last of the tier: template_scope_enablement rows for
  //     class-owned templates must be gone before templates; owner_class_id FK to
  //     classes is NO ACTION so templates must be gone before step 17)
  "setting_values",
  "ai_provider_activations",
  "ai_function_bindings",
  "template_scope_enablement",
  "ai_class_settings",
  "activity_templates",
  // 17.
  "classes",
];

/**
 * Root-first restore order (plan §8.2). NOT the exact inverse of deletion:
 * class_groups precede content tables (real class_group_id FKs) and
 * ai_invocations precede everything holding an ai_invocation_id FK.
 * activity_templates precede template_scope_enablement (template_id FK).
 */
export const RESTORE_ORDER: string[] = [
  "classes",
  "class_groups",
  "class_group_memberships",
  "class_students",
  "class_teachers",
  "class_student_invites",
  "class_teacher_invites",
  "class_mandatory_fields",
  "student_class_info",
  "class_institution_moves",
  "content_items",
  "learning_contents",
  "assignments",
  "quizzes",
  "surveys",
  "setting_values",
  "ai_class_settings",
  "activity_templates",
  "ai_provider_activations",
  "ai_function_bindings",
  "template_scope_enablement",
  "ai_credit_wallets",
  "ai_usage_counters",
  "submissions",
  "ai_invocations", // retry_of self-FK: inserted NULL then patched (see restore script)
  "content_item_overrides",
  "student_content_completions",
  "teacher_content_unlocks",
  "survey_responses",
  "quiz_submissions",
  "submission_questions", // selected_attempt_id: inserted NULL then patched
  "submission_attempts",
  "submission_question_reviews",
  "attempt_ai_evaluations",
  "attempt_grade_drafts",
  "attempt_sessions",
  "chat_messages",
  "voice_messages",
  "static_activity",
  "submission_files",
  "chat_message_actions",
  "submission_transcripts",
  "submission_session_audio",
  "activity_events",
  "activity_logs",
  "app_logs",
  "student_notifications",
  "ai_credit_transactions",
  "ai_credit_balances",
  "ai_credit_wallet_policy_audit",
];

// Sanity: the two orders and the spec map must always cover the same tables.
for (const t of DELETION_ORDER) if (!TABLE_SPECS[t]) throw new Error(`DELETION_ORDER lists unknown table ${t}`);
for (const t of RESTORE_ORDER) if (!TABLE_SPECS[t]) throw new Error(`RESTORE_ORDER lists unknown table ${t}`);
if (new Set(DELETION_ORDER).size !== Object.keys(TABLE_SPECS).length)
  throw new Error("DELETION_ORDER does not cover every TABLE_SPECS entry");
if (new Set(RESTORE_ORDER).size !== Object.keys(TABLE_SPECS).length)
  throw new Error("RESTORE_ORDER does not cover every TABLE_SPECS entry");

// ---------------------------------------------------------------------------
// Clause execution
// ---------------------------------------------------------------------------

function applyClauseFilters<Q extends Filterable<Q>>(
  q: Q,
  clause: Clause,
  inValues?: string[],
): Q {
  for (const eq of clause.eqs ?? []) q = q.eq(eq.column, eq.value);
  if (clause.in && inValues) q = q.in(clause.in.column, inValues);
  if (clause.like) q = q.like(clause.like.column, clause.like.pattern);
  return q;
}

export function pkKey(row: Record<string, unknown>, pk: string[]): string {
  return pk.map((c) => String(row[c])).join(" ");
}

/**
 * Stream every row matching the spec (union of clauses, de-duplicated by PK).
 * `columns` defaults to "*"; pass pk columns only for counting.
 */
export async function selectSpecRows(
  supabase: SupabaseClient,
  spec: TableSpec,
  closure: ClassClosure,
  columns: string,
  onRow: (row: Record<string, unknown>) => void | Promise<void>
): Promise<number> {
  const seen = new Set<string>();
  // pk columns must always be selected — they are the dedup key across clauses
  const selectCols = columns === "*" ? "*" : [...new Set([...columns.split(","), ...spec.pk])].join(",");
  for (const clause of spec.clauses(closure)) {
    const valueChunks = clause.in ? chunk(clause.in.values, IN_CHUNK) : [undefined];
    for (const values of valueChunks) {
      if (clause.in && (!values || values.length === 0)) continue;
      const rows = await pagedSelect(
        supabase,
        spec.table,
        selectCols,
        (q) => applyClauseFilters(q, clause, values as string[] | undefined),
        spec.pk
      );
      for (const row of rows) {
        const key = pkKey(row, spec.pk);
        if (seen.has(key)) continue;
        seen.add(key);
        await onRow(row);
      }
    }
  }
  return seen.size;
}

/** Exact distinct row count for a spec (fetches pk columns only). */
export async function countSpecRows(
  supabase: SupabaseClient,
  spec: TableSpec,
  closure: ClassClosure
): Promise<number> {
  return selectSpecRows(supabase, spec, closure, spec.pk.join(","), () => {});
}

/**
 * Delete every row matching the spec. Single-column-PK tables delete in id
 * batches (resumable, no huge statements); composite-PK tables delete directly
 * by clause. Returns deleted row count.
 */
export async function deleteSpecRows(
  supabase: SupabaseClient,
  spec: TableSpec,
  closure: ClassClosure
): Promise<number> {
  let deleted = 0;
  if (spec.pk.length === 1) {
    const pkCol = spec.pk[0];
    const excl = spec.deleteViaClassCascade;
    const ids: string[] = [];
    await selectSpecRows(
      supabase,
      spec,
      closure,
      excl ? `${pkCol},${excl.column}` : pkCol,
      (r) => {
        if (excl && String(r[excl.column]) === excl.value) return; // classes cascade handles it
        ids.push(String(r[pkCol]));
      }
    );
    for (const part of chunk(ids, IN_CHUNK)) {
      const { error, count } = await supabase
        .from(spec.table)
        .delete({ count: "exact" })
        .in(pkCol, part);
      if (error) {
        if (isMissingTableError(error)) {
          noteMissingTable(spec.table);
          return deleted;
        }
        throw new Error(`delete ${spec.table} failed: ${error.message}`);
      }
      deleted += count ?? 0;
    }
  } else {
    if (spec.deleteViaClassCascade)
      throw new Error(`deleteViaClassCascade is only implemented for single-column-PK tables (${spec.table})`);
    if (missingTables.has(spec.table)) return deleted;
    for (const clause of spec.clauses(closure)) {
      const valueChunks = clause.in ? chunk(clause.in.values, IN_CHUNK) : [undefined];
      for (const values of valueChunks) {
        if (clause.in && (!values || values.length === 0)) continue;
        let q = supabase.from(spec.table).delete({ count: "exact" });
        q = applyClauseFilters(q, clause, values as string[] | undefined);
        const { error, count } = await q;
        if (error) {
          if (isMissingTableError(error)) {
            noteMissingTable(spec.table);
            return deleted;
          }
          throw new Error(`delete ${spec.table} failed: ${error.message}`);
        }
        deleted += count ?? 0;
      }
    }
  }
  return deleted;
}

// ---------------------------------------------------------------------------
// GCS
// ---------------------------------------------------------------------------

export function safeSubmissionId(submissionId: string): string {
  // Mirror the writers (api/multimodal/audio/*): "/" and "\" -> "_"
  return submissionId.replaceAll("/", "_").replaceAll("\\", "_");
}

export function buildGcsPrefixes(closure: ClassClosure): string[] {
  const prefixes: string[] = [];
  for (const aid of closure.assignmentIds) {
    prefixes.push(`submission-files/${aid}/`);
    prefixes.push(`parsed-content/${aid}/`);
  }
  for (const sid of closure.submissionIds) {
    prefixes.push(`voice-recordings/${safeSubmissionId(sid)}/`);
  }
  for (const inv of closure.invocationIds) {
    prefixes.push(`ai-logs/${inv}/`);
  }
  return prefixes;
}

/** Convert a stored value (raw object path OR public URL) to a bucket path. */
export function urlToPath(bucketName: string, value: string): string | null {
  if (!value) return null;
  if (!/^https?:\/\//i.test(value)) return value.replace(/^\/+/, "");
  const marker = `storage.googleapis.com/${bucketName}/`;
  const idx = value.indexOf(marker);
  if (idx === -1) return null; // foreign URL — not ours to touch
  const encoded = value.slice(idx + marker.length).split("?")[0];
  try {
    return encoded.split("/").map(decodeURIComponent).join("/");
  } catch {
    return encoded;
  }
}

/** Row-derived object paths (safety net beyond the prefix sweep). */
export async function collectRowDerivedPaths(
  supabase: SupabaseClient,
  closure: ClassClosure,
  bucketName: string
): Promise<string[]> {
  const paths = new Set<string>();
  const add = (v: unknown) => {
    if (typeof v === "string" && v) {
      const p = urlToPath(bucketName, v);
      if (p) paths.add(p);
    }
  };

  await selectSpecRows(
    supabase, TABLE_SPECS.submission_files, closure, "storage_path,parsed_content_url",
    (r) => { add(r.storage_path); add(r.parsed_content_url); }
  );
  await selectSpecRows(
    supabase, TABLE_SPECS.submission_session_audio, closure, "composite_audio_chunk_urls",
    (r) => { for (const u of (r.composite_audio_chunk_urls as string[] | null) ?? []) add(u); }
  );
  await selectSpecRows(
    supabase, TABLE_SPECS.voice_messages, closure, "audio_file_url",
    (r) => add(r.audio_file_url)
  );
  await selectSpecRows(
    supabase, TABLE_SPECS.ai_invocations, closure, "request_storage_path,response_storage_path",
    (r) => { add(r.request_storage_path); add(r.response_storage_path); }
  );
  return [...paths];
}

/** Simple promise pool. */
export async function pooled<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  let i = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (i < items.length) {
      const item = items[i++];
      await fn(item);
    }
  });
  await Promise.all(workers);
}

export async function withRetry<T>(label: string, fn: () => Promise<T>, tries = 3): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (attempt < tries) {
        const delay = 500 * 2 ** (attempt - 1);
        console.warn(`  retry ${attempt}/${tries - 1} for ${label} in ${delay}ms: ${(e as Error).message}`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastErr;
}

// ---------------------------------------------------------------------------
// Drift guard
// ---------------------------------------------------------------------------

/** Columns that mark a table as (potentially) class-scoped. */
const LINKING_COLUMNS = [
  "class_id",
  "owner_class_id",
  "assignment_id",
  "submission_id",
  "quiz_id",
  "survey_id",
  "content_item_id",
  "wallet_id",
  "attempt_id",
  "submission_question_id",
  // scope-encoded tables: a plain class_id check is structurally blind to these
  "scope_id",
];

/** Global tables allowed to carry a linking column without being in the manifest. */
const KNOWN_GLOBAL_TABLES = new Set([
  "institutions",
  "institution_members",
  "institution_admin_invites",
  "ai_institution_settings",
  "platform_super_admins",
]);

/**
 * Fetch the PostgREST OpenAPI schema and assert every table containing a
 * linking column is either in TABLE_SPECS or on the global allowlist.
 * (information_schema is not exposed over REST; the OpenAPI definitions are.)
 */
export async function driftCheck(target: Target): Promise<string[]> {
  const res = await fetch(`${target.url}/rest/v1/`, {
    headers: { apikey: target.serviceKey, Authorization: `Bearer ${target.serviceKey}` },
  });
  if (!res.ok) throw new Error(`drift check: OpenAPI fetch failed (${res.status})`);
  const spec = (await res.json()) as { definitions?: Record<string, { properties?: Record<string, unknown> }> };
  const offenders: string[] = [];
  for (const [table, def] of Object.entries(spec.definitions ?? {})) {
    if (TABLE_SPECS[table] || KNOWN_GLOBAL_TABLES.has(table)) continue;
    const cols = Object.keys(def.properties ?? {});
    const hit = cols.find((c) => LINKING_COLUMNS.includes(c));
    if (hit) offenders.push(`${table} (via ${hit})`);
  }
  return offenders;
}

// ---------------------------------------------------------------------------
// Archive hashing & manifest
// ---------------------------------------------------------------------------

export interface BackupManifest {
  tool: string;
  version: number;
  createdAt: string;
  source: { env: TargetEnv; url: string; bucket: string };
  classUuid: string;
  classTextId: string;
  className: string;
  closure: ClassClosure;
  tables: Record<string, number>; // distinct row counts (only >0 written to db/)
  missingTables?: string[]; // TABLE_SPECS tables absent from the source schema at backup time
  gcs: { objectCount: number; totalBytes: number; skipped: boolean };
  contentHash: string; // sha256 over db/*.ndjson + gcs-index.json
}

async function listFilesRecursive(dir: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await listFilesRecursive(p)));
    else out.push(p);
  }
  return out;
}

/** sha256 over db/*.ndjson + gcs-index.json, keyed by forward-slash relpath. */
export async function computeArchiveHash(backupDir: string): Promise<string> {
  const hash = createHash("sha256");
  const files: string[] = [];
  const dbDir = join(backupDir, "db");
  if (existsSync(dbDir)) files.push(...(await listFilesRecursive(dbDir)));
  const gcsIndex = join(backupDir, "gcs-index.json");
  if (existsSync(gcsIndex)) files.push(gcsIndex);
  files.sort((a, b) => {
    const ra = relative(backupDir, a).split("\\").join("/");
    const rb = relative(backupDir, b).split("\\").join("/");
    return ra < rb ? -1 : ra > rb ? 1 : 0;
  });
  for (const f of files) {
    const rel = relative(backupDir, f).split("\\").join("/");
    hash.update(rel);
    hash.update(" ");
    await new Promise<void>((resolveP, rejectP) => {
      const s = createReadStream(f);
      s.on("data", (chunkData) => hash.update(chunkData));
      s.on("end", () => resolveP());
      s.on("error", rejectP);
    });
    hash.update(" ");
  }
  return hash.digest("hex");
}

// ---------------------------------------------------------------------------
// CLI helpers
// ---------------------------------------------------------------------------

export function parseCliArgs(argv: string[]): Map<string, string | boolean> {
  const out = new Map<string, string | boolean>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      out.set(key, next);
      i++;
    } else {
      out.set(key, true);
    }
  }
  return out;
}

export function argString(args: Map<string, string | boolean>, key: string): string | undefined {
  const v = args.get(key);
  return typeof v === "string" ? v : undefined;
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}
