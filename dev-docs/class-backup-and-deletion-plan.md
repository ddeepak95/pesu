# Class Backup & Deletion Plan

Status: **PLAN — not yet implemented**
Owner: platform / ops
Goal: Given a single **class id**, (1) produce a complete, self-contained backup of everything related to that class — every DB row across every table **and** every file in GCS — then (2) permanently delete all of it to free storage. Backup is a hard prerequisite for deletion.

The two scripts:

- `scripts/backup-class.ts` — export all class-scoped rows + GCS objects to a timestamped local (or bucket) archive.
- `scripts/delete-class.ts` — permanently delete all class-scoped rows + GCS objects, gated behind a verified backup.

Run with `npx tsx scripts/<name>.ts` (matches existing script conventions in `package.json`).

---

## 1. Design principles

1. **Backup before delete, always.** `delete-class.ts` refuses to run unless it is pointed at a completed, verified backup manifest for the same class id (`--backup <dir>`), or `--force` is explicitly passed by an operator who accepts the risk.
2. **Explicit, ordered, leaf-first deletion — do not trust cascades.** Most child tables in this schema link to parents by **text pseudo-foreign-keys** (`submission_id text`, `assignment_id text`, `quiz_id text`) that have **no real FK constraint** and therefore **no `ON DELETE CASCADE`**. A few chains do cascade (see §4). We delete every table explicitly in dependency order and treat any real cascade as a harmless no-op. This is deterministic and independent of DB-level cascade behavior.
3. **Dry-run by default.** Both scripts print a full plan + counts and change nothing unless `--confirm` is passed. Deletion additionally requires typing the class id back (`--yes-delete <classId>`).
4. **Idempotent & resumable.** Re-running backup overwrites/refreshes the same archive dir deterministically. Re-running delete after a partial failure completes the remainder; already-deleted rows/objects are treated as success.
5. **Verify at the end.** After deletion, re-query every table and re-list every GCS prefix; the run fails loudly if anything class-scoped remains.
6. **Service-role, prod-targeted, but local-testable.** Scripts read `SUPABASE_PROD_URL` + `SUPABASE_SERVICE_ROLE_KEY` and `FIREBASE_SERVICE_ACCOUNT_BASE64` + `FIREBASE_STORAGE_BUCKET` from `.env.local` (same loader pattern as `scripts/backfill-normalized-grading.ts`). A `--env local` flag swaps to `SUPABASE_LOCAL_URL` / `SUPABASE_LOCAL_SERVICE_ROLE_KEY` so the whole flow can be rehearsed against a local Supabase before ever touching prod.

---

## 2. Environment & prerequisites

Required env (already present in `.env.local`):

| Var | Purpose |
|---|---|
| `SUPABASE_PROD_URL` | prod DB REST endpoint |
| `SUPABASE_SERVICE_ROLE_KEY` | bypass RLS for full read/delete |
| `SUPABASE_LOCAL_URL` / `SUPABASE_LOCAL_SERVICE_ROLE_KEY` | rehearsal target (`--env local`) |
| `FIREBASE_SERVICE_ACCOUNT_BASE64` | GCS credentials (via `firebase-admin`) |
| `FIREBASE_STORAGE_BUCKET` | GCS bucket name |

Reuse `getStorageBucket()` from `src/lib/firebase-admin.ts` for GCS access. Use `@supabase/supabase-js` `createClient(url, serviceRoleKey, { auth: { persistSession: false } })` for DB.

> **Guard rail:** the script must print which project it is connected to (URL host + bucket name) and require `--confirm` before any mutation. A `PROD` connection triggers an extra red banner + a 5-second countdown.

---

## 3. Data model — what "everything related to a class" means

### 3.1 Two id systems (critical)

- `classes.id` — **uuid**, the internal primary key. Used by uuid FKs.
- `classes.class_id` — **text**, the human/URL-facing id.

Similarly: `assignments.id` (uuid) + `assignments.assignment_id` (text); `submissions.id` (uuid) + `submissions.submission_id` (text); `quizzes.id`/`quiz_id`; `surveys.id`/`survey_id`; `content_items.id`/`content_item_id`; `learning_contents.id`/`learning_content_id`.

**Input accepted:** either the class uuid or the class text id. Step 1 resolves the row and derives both.

### 3.2 The ID closure

Deletion/backup traverses by collecting a closure of ids from the class root. Resolve these sets up front (all scoped to the class):

```
classId (uuid), classTextId (text)
  → assignmentIds (text)      = assignments.assignment_id where class_id = classId
  → quizIds (text/uuid)       = quizzes where class_id = classId
  → surveyIds (uuid)          = surveys where class_id = classId
  → contentItemIds (uuid)     = content_items where class_id = classId
  → learningContentIds        = learning_contents where class_id = classId
  → classGroupIds (uuid)      = class_groups where class_id = classId
  → submissionIds (text)      = submissions.submission_id where assignment_id IN assignmentIds
  → submissionQuestionIds     = submission_questions where submission_id IN submissionIds
  → attemptIds (uuid)         = submission_attempts where submission_question_id IN submissionQuestionIds
  → attemptSessionIds (uuid)  = attempt_sessions where submission_id IN submissionIds
  → chatMessageIds (uuid)     = chat_messages where submission_id IN submissionIds OR assignment_id IN assignmentIds
  → aiInvocationIds (uuid)    = ai_invocations where class_id = classId OR assignment_id IN assignmentIds OR submission_id IN submissionIds
  → walletIds (uuid)          = ai_credit_wallets where class_id = classId   (NEVER the class_id IS NULL institution pool)
```

> Because pseudo-FK columns are nullable and sometimes populated late, build each set with `OR` across all known linking columns (e.g. `ai_invocations` can be reached by `class_id`, `assignment_id`, **and** `submission_id`). De-duplicate.

### 3.3 Table inventory (grouped by linkage)

The script hardcodes this ordered manifest **and** cross-checks it at runtime against `information_schema.columns` for any table containing a `class_id` column (drift guard — see §6). New class-scoped tables must be added here.

**Tier 0 — root**
- `classes` (delete last)

**Tier 1 — direct `class_id` (uuid) column**
- `class_mandatory_fields`, `student_class_info`, `class_groups`, `class_group_memberships`, `class_institution_moves`, `class_student_invites`, `class_students`, `class_teacher_invites`, `class_teachers`
- `content_items`, `learning_contents`, `assignments`, `quizzes`, `surveys`
- `quiz_submissions` (has both `class_id` and `quiz_id`)
- `activity_events`, `activity_logs` (nullable `class_id` + `submission_id`)
- `ai_invocations` (nullable `class_id`; also `assignment_id`, `submission_id`)
- `app_logs` (`class_id` `ON DELETE SET NULL`; also `submission_id`, `ai_invocation_id`)
- `ai_class_settings` (per-class AI config; see `20260708020000_per_class_ai_override.sql`)
- `ai_usage_counters` (composite PK `institution_id, class_id, …`; `class_id` default `0000…` = institution pool → **only delete rows where class_id = classId**)
- `ai_credit_wallets` (`class_id` nullable — **NULL = institution pool, never touch**)

**Tier 1b — scope-encoded** (no FK to `classes` — these orphan silently if missed; the `class_id` drift guard cannot see them)
- `setting_values` — rows where `scope = 'class' AND scope_id = classId`
- `ai_provider_activations` — rows where `scope = 'class' AND scope_id = classId` (per-class BYOK activations, **including `encrypted_api_key`** — must not be orphaned; see `20260708020000_per_class_ai_override.sql`)
- `ai_function_bindings` — rows where `scope = 'class' AND scope_id = classId` (per-class model bindings)
- `template_scope_enablement` — rows where `scope = 'class' AND scope_id = classId` (the class palette / "Add to class" rows; Phase 2 uses class scope only). Rows pointing at templates the class does **not** own cascade from nothing and would orphan. (Rows for class-owned templates also cascade via `template_id` when those templates are deleted — deleting explicitly first is a harmless overlap.)
- `activity_templates` — rows where `owner_class_id = classId` (class-owned templates). Forks reference via `forked_from … ON DELETE SET NULL`, so deleting them is safe. **Decision needed** (see §9): back up + delete, or preserve.

**Tier 2 — via `assignment_id` (text)**
- `submissions`, `chat_messages`, `voice_messages`, `submission_files`, `static_activity`

**Tier 2 — via `quiz_id` / `survey_id` / `content_item_id`**
- `survey_responses` (via `survey_id`; **no** direct `class_id`)
- `content_item_overrides`, `student_content_completions`, `teacher_content_unlocks` (via `content_item_id`)

**Tier 3 — via `submission_id` (text)**
- `submission_transcripts`, `submission_session_audio`, `submission_questions`, `attempt_sessions`, `chat_message_actions` (also FK-cascades from `chat_messages`)

**Tier 4 — via `submission_question_id` (real FK, cascades)**
- `submission_attempts`, `submission_question_reviews`

**Tier 5 — via `attempt_id` (real FK, cascades)**
- `attempt_ai_evaluations`, `attempt_grade_drafts`

**Wallet children — via `wallet_id` (real FK, cascades from `ai_credit_wallets`)**
- `ai_credit_transactions`, `ai_credit_balances`, `ai_credit_wallet_policy_audit`

**Special: `student_notifications`** — keyed only by `student_id`; class linkage lives in the `data` jsonb. **Confirmed shape** (`src/lib/queries/notifications.ts`): `data = { nav_path, assignment_title }` — there is **no** `submission_id` key, so matching on `data->>'submission_id'` would match zero rows and silently leave everything behind. Match on `data->>'nav_path'` instead (path segments contain the class/assignment ids). **Decision needed** (§9) — over-deleting here could remove a student's notifications for other classes if the payload is ambiguous; default is to back up matches and delete only unambiguous ones.

**Explicitly OUT of scope (global / cross-class — never touched):**
`institutions`, `institution_members`, `institution_admin_invites`, `ai_institution_settings`, `platform_super_admins`. For the scope-encoded tables (`ai_provider_activations`, `ai_function_bindings`, `template_scope_enablement`, `setting_values`), only their **non-class-scope rows** (`scope = 'platform' | 'institution'`) are out of scope — class-scope rows are Tier 1b above. Auth users are shared across classes and are never deleted. (`approved_teachers` was dropped in `20260526200000` and no longer exists.)

### 3.4 GCS object inventory

All storage goes to the single Firebase bucket (`FIREBASE_STORAGE_BUCKET`). Paths (confirmed in code):

| Prefix | Written by | Keyed on | Row source |
|---|---|---|---|
| `submission-files/{assignmentId}/{submissionId}/…` | `api/files/request-upload/route.ts` | assignment + submission | `submission_files.storage_path` |
| `parsed-content/{assignmentId}/{submissionId}/{fileId}.md` | `lib/parseSubmissionFile.ts` | assignment + submission | `submission_files.parsed_content_url` |
| `voice-recordings/{safeSubmissionId}/{questionOrder}/{attemptNumber}/…wav` | `api/multimodal/audio/session-chunk` & `…/utterance` | submission (`/` `\` → `_`) | `submission_session_audio.composite_audio_chunk_urls`, `voice_messages.audio_file_url` |
| `ai-logs/{invocationId}/request.json`, `response.json` | `lib/ai/logging/recordInvocation.ts` | ai invocation | `ai_invocations.request_storage_path` / `response_storage_path` |

**Two deletion strategies, run both for completeness:**

1. **Prefix sweep (primary):** for each `assignmentId`/`submissionId`/`invocationId` in the closure, `bucket.getFiles({ prefix })` and delete/download every object. Prefixes:
   - `submission-files/{assignmentId}/` and `.../{assignmentId}/{submissionId}/`
   - `parsed-content/{assignmentId}/`
   - `voice-recordings/{safeSubmissionId}/` (apply the same `/`,`\` → `_` sanitization as the writers)
   - `ai-logs/{invocationId}/`
2. **Row-derived sweep (safety net):** additionally collect every explicit path/url stored on rows (`submission_files.storage_path`, `submission_files.parsed_content_url`, `submission_session_audio.composite_audio_chunk_urls[]`, `voice_messages.audio_file_url`) and delete those exact objects too. Catches any object whose prefix drifted from convention.

The union of both is the file set the backup downloads and the deleter removes.

---

## 4. Real cascade chains (informational)

These have true `ON DELETE CASCADE` and will self-clean, but we still delete explicitly:

- `submission_questions` → `submission_attempts` → (`attempt_ai_evaluations`, `attempt_grade_drafts`) ; `submission_questions` → `submission_question_reviews`
- `chat_messages` → `chat_message_actions`
- `ai_credit_wallets` → (`ai_credit_transactions`, `ai_credit_balances`, `ai_credit_wallet_policy_audit`)
- `submissions(submission_id)` → `submission_questions`, `attempt_sessions` (text FKs with cascade). **Note:** `submission_transcripts` and `submission_session_audio` have **no FK** to `submissions` at all — nothing cascades them; only the explicit delete removes them.
- Some Tier-1 `class_id` columns declare `ON DELETE CASCADE` to `classes`; others `SET NULL` (`app_logs.class_id`, and one nullable `ai_*` link). Do not rely on this — order handles it.

**Mandatory-order FKs (`NO ACTION` — wrong order hard-fails, not just orphans):**
- `chat_messages.submission_id` → `submissions(submission_id)` has **no** ON DELETE action: `submissions` cannot be deleted while its `chat_messages` remain. The Tier ordering (messages before submissions) is required, not just preferred.
- `activity_templates.owner_class_id` → `classes(id)` has **no** ON DELETE action: the final `classes` delete fails if class-owned templates survive (see §9.1).

FKs into `ai_invocations` — `chat_messages.ai_invocation_id`, `app_logs.ai_invocation_id`, `attempt_ai_evaluations.ai_invocation_id`, self-FK `retry_of` — are all `ON DELETE SET NULL` (fine for delete order; they constrain **restore** order, §8.2).

`attempt_sessions` and the `session_id` links on `chat_messages`/`voice_messages`/`static_activity`/`submission_transcripts` are `ON DELETE SET NULL`; delete `attempt_sessions` in Tier 3 after its referencing rows are gone or nulled.

---

## 5. `backup-class.ts` design

**CLI:** `npx tsx scripts/backup-class.ts --class <uuid|textId> [--env prod|local] [--out <dir>] [--no-files] [--confirm]`

Backup is read-only, so `--confirm` is not strictly required, but it still prints the plan first.

**Output layout:**
```
class-backups/{classTextId}_{YYYYMMDD-HHmmss}/
  manifest.json            # class ids, id closure, per-table row counts, per-prefix object counts, checksums, tool version, source URL/bucket, timestamps
  db/
    classes.ndjson
    assignments.ndjson
    submissions.ndjson
    … one NDJSON file per table (only tables with >0 rows) …
  gcs/
    submission-files/…     # mirrored object tree, original paths preserved
    parsed-content/…
    voice-recordings/…
    ai-logs/…
  gcs-index.json           # [{ path, size, md5, access: "public"|"private", downloadedTo }]
  RESTORE.md               # generated notes on how to re-import (see §8)
```

**Algorithm:**
1. Resolve class + build ID closure (§3.2).
2. For each table in the manifest, `select *` filtered by the appropriate id set, **paginated** (range 1000 rows) to avoid REST limits. Stream rows to `db/<table>.ndjson`. Record count.
3. Build the GCS file set (union of prefix sweep + row-derived, §3.4). Download each object to `gcs/<originalPath>`; record size + md5 in `gcs-index.json`.
4. Write `manifest.json` with everything needed to (a) verify the backup and (b) drive deletion: the exact id closure, table counts, object list, and a content hash of `db/` + `gcs-index.json`.
5. Print summary: total rows, total objects, total bytes, output dir.

**Robustness:**
- Paginate all reads; never assume a table fits in one request.
- `for await` over `bucket.getFiles({ prefix, autoPaginate: true })`.
- Retry transient GCS/DB errors with backoff; fail the run if any object listed cannot be downloaded (a backup with gaps is not a backup).
- NDJSON (one JSON row per line) so large tables stream without holding everything in memory.

---

## 6. `delete-class.ts` design

**CLI:** `npx tsx scripts/delete-class.ts --class <uuid|textId> --backup <dir> [--env prod|local] [--confirm] [--yes-delete <classTextId>] [--skip-files] [--force]`

**Preconditions (all must pass or the script aborts):**
1. `--backup <dir>` exists, its `manifest.json` parses, and `manifest.classId === resolved classId`.
2. Backup integrity check: recompute the `db/` + `gcs-index.json` content hash and compare to the manifest. Mismatch → abort (unless `--force`).
3. Re-resolve the **current** ID closure from the live DB and diff against the manifest closure. If new rows/objects appeared since backup (e.g. active class), warn and require re-running backup (or `--force`).
4. `--confirm` present, and `--yes-delete` equals the class text id.

**Deletion order (leaf → root):** exact reverse of §3.3 tiers.

```
1. Wallet children:  ai_credit_wallet_policy_audit, ai_credit_balances, ai_credit_transactions
2. Attempt leaves:   attempt_grade_drafts, attempt_ai_evaluations
3. Question leaves:  submission_question_reviews, submission_attempts
4. submission_questions
5. Session/message leaves: chat_message_actions, submission_transcripts, submission_session_audio, attempt_sessions
6. chat_messages, voice_messages, static_activity, submission_files
7. survey_responses, quiz_submissions
8. content_item_overrides, student_content_completions, teacher_content_unlocks
9. submissions
10. activity_events, activity_logs, app_logs, ai_invocations
11. student_notifications (matched rows only — see §9)
12. ai_usage_counters (class rows only), ai_credit_wallets (class wallets only)
13. content_items, learning_contents
14. assignments, quizzes, surveys
15. class_groups, class_group_memberships, class_students, class_teachers,
    class_student_invites, class_teacher_invites, class_mandatory_fields,
    student_class_info, class_institution_moves
16. setting_values (scope='class'), ai_provider_activations (scope='class'),
    ai_function_bindings (scope='class'), template_scope_enablement (scope='class'),
    ai_class_settings, activity_templates (owner_class_id — must be deleted or
    re-scoped before step 17; its FK to classes is NO ACTION)
17. classes   ← last
```

**GCS deletion:** after DB rows are gone (or interleaved before, doesn't matter since backup holds them), delete every object in the file set. Use `bucket.deleteFiles({ prefix, force: true })` per prefix for bulk efficiency, then a row-derived pass for stragglers. Treat 404 (already gone) as success.

**Batching & safety:**
- Delete in batches (e.g. `.in('col', chunkOf500)`) to stay within statement limits.
- Log every table's deleted-row count.
- Wrap logically per tier; on error, stop, print what was deleted, and exit non-zero so a re-run resumes.

**Verification pass (mandatory):**
- Re-query every table in the manifest with the class filters → assert 0 rows.
- Re-list every GCS prefix → assert 0 objects.
- Re-query `classes` by id → assert not found.
- Write `deletion-report.json` (per-table deleted counts, per-prefix deleted counts, bytes freed, verification result) next to the backup.
- Exit non-zero if anything remains.

**Drift guard:** before deleting, run
```sql
select table_name, column_name from information_schema.columns
where table_schema = 'public'
  and column_name in (
    'class_id', 'owner_class_id',
    -- pseudo-FK linking columns (tables reachable without any class_id column):
    'assignment_id', 'submission_id', 'quiz_id', 'survey_id',
    'content_item_id', 'wallet_id', 'attempt_id', 'submission_question_id',
    -- scope-encoded tables (scope_id is a generic uuid; a plain class_id check
    -- is structurally blind to these — this exact blind spot is how
    -- ai_provider_activations/ai_function_bindings/template_scope_enablement
    -- were originally missed in this plan):
    'scope_id'
  )
```
and assert every returned table is present in the manifest (minus the known-global allowlist, and minus scope-encoded tables whose scope enum cannot contain `'class'`). A new, unlisted class-scoped table aborts the run — forces the manifest to be updated so nothing is silently orphaned.

---

## 7. Safety, idempotency, and failure recovery

- **Dry-run default:** without `--confirm`, both scripts print the full plan (id closure, per-table counts, GCS object counts + total bytes) and exit 0 without mutating.
- **Idempotent delete:** filters are id-set based; re-running after partial failure deletes only what remains. Already-empty tables and 404 objects are no-ops.
- **No partial-backup deletes:** deletion aborts unless the backup manifest verifies.
- **Ordering guarantees no orphans:** leaf-first ordering + final zero-row verification.
- **Observability:** structured progress logs; final JSON reports for both backup and deletion, retained in the archive dir.

---

## 8. `restore-class.ts` design (backup is only as good as its restore)

A backup you cannot restore is not a backup — it is deleted data with extra steps. `restore-class.ts` re-imports an archive produced by `backup-class.ts` back into a Supabase project + GCS bucket, reconstructing the class exactly. It is a **committed deliverable and must exist and be rehearsed before the first real prod deletion.** Restore is also the ultimate integrity test of a backup: the go/no-go gate before deleting is "we restored this archive into local Supabase and the class came back whole."

**CLI:** `npx tsx scripts/restore-class.ts --backup <dir> [--env prod|local] [--confirm] [--skip-files] [--on-conflict skip|overwrite|abort] [--remap-class <newTextId>]`

Like the others: dry-run without `--confirm` (prints exactly what would be inserted per table + objects uploaded + total bytes), and prints the target URL/bucket with a red banner when the target is PROD.

### 8.1 Preconditions
1. `--backup <dir>` exists, `manifest.json` parses, and the `db/` + `gcs-index.json` content hash matches the manifest (same integrity check as delete). Abort on mismatch unless `--force`.
2. **Absence check (default):** the class must **not** already exist in the target (`classes` by `id` and by `class_id`). If it does, `--on-conflict` governs behavior:
   - `abort` (default) — refuse; restoring over a live class risks id collisions and partial merges.
   - `skip` — upsert-insert only rows whose PK is absent; leave existing rows untouched (idempotent re-run / resume).
   - `overwrite` — upsert every row by PK (last-writer-wins). Use only for a true rollback of a botched delete.
3. Target reachable; service role key present.

### 8.2 DB restore — insert order (root → leaf)
Foreign-key-safe ordering guarantees every parent exists before its children. **Not** the exact inverse of the deletion order — two real-FK constraints force deviations: (a) `class_groups` must precede the content tables (`assignments`/`content_items`/`learning_contents`/`quizzes`/`surveys` all have a real `class_group_id → class_groups(id)` FK), and (b) `ai_invocations` must precede `attempt_ai_evaluations` and `chat_messages` (both carry a real `ai_invocation_id` FK):

```
1.  classes                                              ← first
2.  class_groups, class_group_memberships, class_students, class_teachers,
    class_student_invites, class_teacher_invites, class_mandatory_fields,
    student_class_info, class_institution_moves
3.  content_items, learning_contents, assignments, quizzes, surveys
    (real FK class_group_id → class_groups; must come after tier 2)
4.  setting_values, ai_provider_activations, ai_function_bindings,
    template_scope_enablement, ai_class_settings, activity_templates (if in archive)
5.  ai_credit_wallets, ai_usage_counters
6.  submissions
7.  ai_invocations   (before anything with an ai_invocation_id FK; self-FK retry_of
    is SET NULL — insert parents-first within the table or patch in a second pass)
8.  content_item_overrides, student_content_completions, teacher_content_unlocks
9.  survey_responses, quiz_submissions
10. submission_questions
11. submission_attempts, submission_question_reviews
12. attempt_ai_evaluations, attempt_grade_drafts   (FK ai_invocation_id → 7)
13. attempt_sessions
14. chat_messages, voice_messages, static_activity, submission_files
    (chat_messages before voice_messages: voice_messages.chat_message_id FK;
    chat_messages FKs: submission_id → 6, ai_invocation_id → 7, session_id → 13)
15. chat_message_actions, submission_transcripts, submission_session_audio
16. activity_events, activity_logs, app_logs   (app_logs FK ai_invocation_id → 7)
17. student_notifications
18. ai_credit_transactions, ai_credit_balances, ai_credit_wallet_policy_audit  ← last (wallet children)
```

Within a tier, insert tables in the listed order (intra-tier FKs like `voice_messages.chat_message_id` depend on it).

- **Preserve original ids.** Insert rows verbatim including their original uuid/text primary keys and all id columns, so every pseudo-FK (`submission_id`, `assignment_id`, `attempt_id`, `wallet_id`, …) re-links correctly. Do **not** let the DB regenerate `gen_random_uuid()` defaults.
- **Deferred self/late FKs:** `submission_questions.selected_attempt_id` references `submission_attempts` which is inserted later. Insert `submission_questions` with `selected_attempt_id = NULL` first, then **patch** it in a second pass after `submission_attempts` exists. Same pattern for any column the archive shows pointing "forward" in the order.
- **`upsert(onConflict: pk)`** for idempotency so a failed restore can resume.
- **Batch** inserts (chunks of ~500) and stream from NDJSON — never load a whole table into memory.
- **Cross-table dependencies outside the archive** (shared, never backed up): rows reference `auth.users(id)`, `institutions(id)`, and `class_groups`/institution config that live outside the class. The restore **asserts these exist** in the target before inserting dependent rows and reports any missing referenced user/institution ids rather than failing mid-insert. (In-place rollback on the same project: they still exist. Cross-project restore: this is the main caveat — see §8.5.)

### 8.3 GCS restore
- Re-upload every object in `gcs/` to its **original path** in the target bucket (paths are preserved in the archive tree and `gcs-index.json`).
- Verify each upload's md5 against `gcs-index.json`; fail the run on mismatch.
- Re-apply the access mode the writers used: `voice-recordings/*` objects are `makePublic()` in the app, so restore calls `makePublic()` on them; `submission-files/*`, `parsed-content/*`, and `ai-logs/*` stay private (served via signed URLs / read server-side). The mode per prefix is recorded in `gcs-index.json` at backup time so restore doesn't have to guess.
- `--skip-files` restores DB only (e.g. when the bucket objects were never deleted).

### 8.4 `--remap-class` (optional, restore as a *copy*)
For cloning a class into a new id instead of a true rollback: generate a fresh `classes.id`/`class_id` (and, if needed, fresh assignment/submission ids), rewrite every reference during import, and re-key GCS prefixes accordingly. This is strictly harder (every text-id rewrite must be consistent across all tables + GCS paths) and is **out of scope for v1** — listed here so the id-preservation design in §8.2 isn't mistaken for the only option. v1 restores with original ids only.

### 8.5 Verification pass (mandatory)
- Re-query every table with the class filters → assert row count **equals the manifest count** (not just >0).
- Re-list every GCS prefix → assert object count + total bytes match the manifest.
- Spot-check referential integrity: every `submission_questions.selected_attempt_id` resolves, every `submission_files.storage_path` object exists, wallet balances reconcile.
- Write `restore-report.json` (per-table inserted counts, per-prefix uploaded counts, bytes, any missing external refs, verification result) into the backup dir.
- Exit non-zero if any count diverges from the manifest.

### 8.6 Caveats
- **Cross-project restore** (prod archive → a different project) will have dangling `auth.users` / `institutions` references unless those are restored/mapped first. The intended use is **same-project rollback** (undo an accidental delete); cross-project is a copy operation and needs the external refs handled out of band.
- **Not point-in-time.** Restore reconstructs the archive's snapshot; anything written to the class after the backup (and before deletion) is not in the archive. The delete-side drift check (§6) exists precisely to catch this window.
- `RESTORE.md` is still generated inside each archive as a human-readable pointer to `restore-class.ts` + the exact command, so the archive is self-describing even years later.

---

## 9. Open decisions (resolve before implementation)

1. **`activity_templates` with `owner_class_id = classId`** — back up **and** delete (class-owned templates die with the class), or back up and **preserve**? Default proposal: back up + delete, since forks are `SET NULL` and survive. **Note:** "preserve" is not viable as-is — `owner_class_id → classes(id)` is `NO ACTION`, so the final `classes` delete fails while class-owned templates survive, and the ownership check constraint requires `owner_class_id NOT NULL` when `owner_scope = 'class'`. Preserving means re-scoping the template (e.g. to institution/personal ownership), not skipping it. Also note: deleting a class-owned template cascades its `template_scope_enablement` rows out of **other** classes' palettes that had added it.
2. **`student_notifications`** — payload-based matching is fuzzy. Default: back up all rows whose `data->>'nav_path'` unambiguously resolves to this class (path contains the class/assignment ids), delete only those; leave the rest. (Shape confirmed in §3.3 — there is no `submission_id` key in `data`.)
3. **Institution-level rollups** — deleting the class removes its `ai_usage_counters` rows and class wallet balances, which changes historical institution usage/billing aggregates. Additionally, the nightly reconcile jobs **derive** institution-level state from `ai_invocations`: `reconcile_ai_credit_balances()` recomputes the institution pool wallet balance from the sum of completed platform-key invocations, so deleting a class's metered invocation rows would re-credit the pool by that class's historical spend at the next run (logged only as "drift"). **Scope note (2026-07-17): moot for the current effort** — this tooling targets classes whose data predates the AI metering push, so their invocations carry no `credits`/`wallet_id` and reconcile is unaffected. If a *metered* class is ever deleted with these scripts, insert a compensating `adjustment` row in `ai_credit_transactions` on the pool wallet (or explicitly accept the refund). Backup preserves all rows regardless.
4. **Backup destination** — local dir (default) vs. a dedicated cold GCS bucket / archive prefix. For prod at scale, prefer uploading the archive to a separate long-term bucket rather than an operator's laptop.
5. **`--force` semantics** — exact list of checks it is allowed to bypass. Proposal: it may bypass the "class changed since backup" drift check but **never** the "backup exists + integrity" check.

---

## 10. Implementation checklist

- [x] `scripts/lib/classClosure.ts` — shared: env loading (mirror `backfill-normalized-grading.ts`), Supabase service client, `getStorageBucket()`, class resolution, ID-closure builder, table manifest (ordered), GCS prefix builder, drift check (via the PostgREST OpenAPI schema — `information_schema` is not exposed over REST).
- [x] `scripts/backup-class.ts` — §5.
- [x] `scripts/delete-class.ts` — §6.
- [x] `scripts/restore-class.ts` — §8 (before first prod deletion).
- [ ] Rehearse end-to-end on **local** Supabase (`--env local`) with a seeded throwaway class: backup → delete → verify zero → restore → re-verify.
- [ ] Dry-run against **prod** for a real (small) class; review the printed plan and counts.
- [ ] Execute prod backup, verify manifest + integrity hash, then delete with `--confirm --yes-delete`.
- [x] Add `backup:class` / `delete:class` / `restore:class` entries to `package.json` scripts for discoverability.

> **Implementation notes (2026-07-17):** the drift guard reads the PostgREST OpenAPI
> definitions instead of `information_schema` (not REST-exposed). GCS access for
> `--env local` still points at the real Firebase bucket — rehearse with a seeded
> class that has no storage objects, or use `--no-files`/`--skip-files`.
> `student_notifications` matching uses `data->>nav_path LIKE %<classTextId>%`.

---

## 11. Runbook (operator)

```bash
# 0. Rehearse the FULL loop locally first (seed a disposable class in local Supabase).
#    Restoring the archive back to a whole class is the go/no-go gate for any prod delete.
npx tsx scripts/backup-class.ts   --env local --class <textId>
npx tsx scripts/delete-class.ts   --env local --class <textId> --backup class-backups/<dir> --confirm --yes-delete <textId>
npx tsx scripts/restore-class.ts  --env local --backup class-backups/<dir> --confirm
#    → verify row counts + GCS objects match the manifest before trusting the archive on prod

# 1. PROD dry run — prints plan + counts, changes nothing
npx tsx scripts/backup-class.ts  --class <uuid|textId>

# 2. PROD backup (writes archive + manifest)
npx tsx scripts/backup-class.ts  --class <uuid|textId> --confirm

# 3. PROD delete dry run — verifies backup, prints deletion plan
npx tsx scripts/delete-class.ts  --class <uuid|textId> --backup class-backups/<dir>

# 4. PROD delete for real
npx tsx scripts/delete-class.ts  --class <uuid|textId> --backup class-backups/<dir> --confirm --yes-delete <textId>
# → runs deletion, then verification, writes deletion-report.json, exits non-zero if anything remains

# 5. ROLLBACK (only if a delete was a mistake) — restore the archive in place, same project
npx tsx scripts/restore-class.ts --class <uuid|textId> --backup class-backups/<dir> --confirm
# → same-project rollback; auth.users / institution rows still exist so external refs re-link cleanly
```
