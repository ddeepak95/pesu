import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { saveContentCompletion } from "../src/lib/content/saveCompletion";
import { getContentUnlockState } from "../src/lib/content/unlock";
import { submitAndComplete } from "../src/lib/quizzes/submitAndComplete";

type Row = Record<string, unknown>;
function database(tables: Record<string, Row[]>, failTable?: string) {
  const client = {
    from(table: string) {
      const filters: ((row: Row) => boolean)[] = [];
      let sortKey: string | undefined;
      const run = () => {
        if (table === failTable) return { data: null, error: new Error("Database unavailable") };
        const data = (tables[table] ?? []).filter(row => filters.every(f => f(row)));
        if (sortKey) data.sort((a, b) => Number(a[sortKey!]) - Number(b[sortKey!]));
        return { data, error: null };
      };
      const query = {
        select() { return query; },
        eq(key: string, value: unknown) { filters.push(row => row[key] === value); return query; },
        in(key: string, values: unknown[]) { filters.push(row => values.includes(row[key])); return query; },
        order(key: string) { sortKey = key; return query; },
        async maybeSingle() {
          const result = run();
          if (result.error) return result;
          if (result.data!.length > 1) return { data: null, error: new Error("Ambiguous placement") };
          return { data: result.data![0] ?? null, error: null };
        },
        async single() {
          const result = await query.maybeSingle();
          return result.data ? result : { data: null, error: result.error ?? new Error("Missing row") };
        },
        async upsert(row: Row, options: { ignoreDuplicates?: boolean; onConflict: string }) {
          if (table === failTable) return { error: new Error("Write failed") };
          assert.equal(options.onConflict, "student_id,content_item_id");
          const rows = tables[table] ?? (tables[table] = []);
          const existing = rows.find(r => r.student_id === row.student_id && r.content_item_id === row.content_item_id);
          if (existing && !options.ignoreDuplicates) return { error: new Error("UPDATE denied by RLS") };
          if (!existing) rows.push({ id: "completion", completed_at: "2026-01-01T12:00:00Z", ...row });
          return { error: null };
        },
        then(resolve: (value: ReturnType<typeof run>) => unknown) { return Promise.resolve(run()).then(resolve); },
      };
      return query;
    },
  };
  return client as unknown as SupabaseClient;
}

function fixture() {
  return {
    classes: [{ id: "class", class_id: "short", status: "active", enable_progressive_unlock: true }],
    class_group_memberships: [{ class_id: "class", student_id: "student", group_id: "group" }],
    content_items: [
      { id: "quiz", ref_id: "quiz-ref", type: "quiz", class_id: "class", class_group_id: "group", status: "active", position: 0 },
      { id: "draft", ref_id: "draft-ref", type: "learning_content", class_id: "class", class_group_id: "group", status: "draft", position: 1 },
      { id: "content", ref_id: "content-ref", type: "learning_content", class_id: "class", class_group_id: "group", status: "active", position: 2 },
      { id: "next", ref_id: "next-ref", type: "quiz", class_id: "class", class_group_id: "group", status: "active", position: 3 },
    ],
    student_content_completions: [],
    teacher_content_unlocks: [],
  } as Record<string, Row[]>;
}
const unlock = (db: SupabaseClient, ref = "content-ref", type: "quiz" | "learning_content" = "learning_content") =>
  getContentUnlockState(db, "student", "short", ref, type);

test("repeated and concurrent completion preserves the original timestamp without UPDATE", async () => {
  const tables = fixture();
  const db = database(tables);
  const first = await saveContentCompletion(db, "student", "quiz");
  const results = await Promise.all([saveContentCompletion(db, "student", "quiz"), saveContentCompletion(db, "student", "quiz")]);
  assert.equal(tables.student_content_completions.length, 1);
  assert.ok(results.every(row => row.completed_at === first.completed_at));
});

test("quiz and reading completion each unlock the following active item, skipping drafts", async () => {
  const db = database(fixture());
  assert.equal((await unlock(db)).isLocked, true);
  await saveContentCompletion(db, "student", "quiz");
  assert.equal((await unlock(db)).isLocked, false);
  assert.equal((await unlock(db, "next-ref", "quiz")).isLocked, true);
  await saveContentCompletion(db, "student", "content");
  assert.equal((await unlock(db)).isComplete, true);
  assert.equal((await unlock(db, "next-ref", "quiz")).isLocked, false);
});

test("placement lookup is scoped to class and student group", async () => {
  const tables = fixture();
  tables.content_items.push({ ...tables.content_items[2], id: "other-group", class_group_id: "other" });
  tables.content_items.push({ ...tables.content_items[2], id: "other-class", class_id: "other" });
  assert.equal((await unlock(database(tables))).contentItemId, "content");
  const wrongPlacement = await getContentUnlockState(database(tables), "student", "short", "content-ref", "learning_content", "other-group");
  assert.equal(wrongPlacement.isLocked, true);
  assert.equal(wrongPlacement.contentItemId, null);
});

test("ambiguous placements and failed reads are surfaced", async () => {
  const tables = fixture();
  tables.content_items.push({ ...tables.content_items[2], id: "duplicate" });
  await assert.rejects(unlock(database(tables)), /Ambiguous/);
  await assert.rejects(unlock(database(fixture(), "student_content_completions")), /Database unavailable/);
});

test("missing group or inactive placement cannot silently bypass unlock", async () => {
  const tables = fixture();
  tables.class_group_memberships = [];
  assert.equal((await unlock(database(tables))).isLocked, true);
  assert.equal((await unlock(database(fixture()), "draft-ref")).isLocked, true);
});

test("teacher locks and lock-after-complete remain effective", async () => {
  const tables = fixture();
  tables.content_items[2].require_teacher_unlock = true;
  const db = database(tables);
  await saveContentCompletion(db, "student", "quiz");
  assert.match((await unlock(db)).lockReason!, /teacher approval/);
  tables.teacher_content_unlocks.push({ student_id: "student", content_item_id: "content" });
  assert.equal((await unlock(db)).isLocked, false);
  tables.content_items[2].lock_after_complete = true;
  await saveContentCompletion(db, "student", "content");
  assert.equal((await unlock(db)).isLockedAfterComplete, true);
  assert.equal((await unlock(db, "next-ref", "quiz")).isLocked, false);
});

test("day delays remain effective with progressive unlock enabled or disabled", async () => {
  for (const enabled of [true, false]) {
    const tables = fixture();
    tables.classes[0].enable_progressive_unlock = enabled;
    tables.content_items[2].unlock_days_after_previous = 2;
    tables.student_content_completions.push({ student_id: "student", content_item_id: "quiz", completed_at: new Date().toISOString() });
    assert.equal((await unlock(database(tables))).isLocked, true);
    tables.student_content_completions[0].completed_at = "2000-01-01T00:00:00Z";
    assert.equal((await unlock(database(tables))).isLocked, false);
  }
});

test("marker failure retains submission; retry and reload never submit answers twice", async () => {
  const tables = fixture();
  let saved: { id: string } | null = null;
  let submissions = 0;
  const createSubmission = async () => { submissions++; return { id: "submitted" }; };
  const onSubmissionSaved = (row: { id: string }) => { saved = row; };
  await assert.rejects(submitAndComplete({
    existingSubmission: saved, createSubmission, onSubmissionSaved,
    markComplete: () => saveContentCompletion(database(tables, "student_content_completions"), "student", "quiz"),
  }), /Write failed/);
  assert.deepEqual(saved, { id: "submitted" });
  assert.equal((await unlock(database(tables))).isLocked, true);
  for (const existingSubmission of [saved, JSON.parse(JSON.stringify(saved)) as { id: string }]) {
    await submitAndComplete({ existingSubmission, createSubmission, onSubmissionSaved,
      markComplete: () => saveContentCompletion(database(tables), "student", "quiz"),
    });
  }
  assert.equal(submissions, 1);
  assert.equal((await unlock(database(tables))).isLocked, false);
});

test("failed submission never marks completion", async () => {
  let marked = false;
  await assert.rejects(submitAndComplete({
    existingSubmission: null,
    createSubmission: async () => { throw new Error("Submit failed"); },
    onSubmissionSaved: () => assert.fail("No saved submission expected"),
    markComplete: async () => { marked = true; },
  }), /Submit failed/);
  assert.equal(marked, false);
});
