# Implementation Guide — Tentative Feedback, Submission-Level Release & Selected Attempt

> **For the implementing agent (Claude Code).** This is an execution plan, not just a design. Work
> **one phase at a time, top to bottom** — each phase is sized to compile and pass its own checks.
> After each phase run its **Verify** block; don't start the next phase until it is green. If reality
> diverges from a cited `file:line` (the repo moves), re-locate by symbol name with Grep and trust the
> code over this doc. Ask before inventing product behaviour not specified here.

---

## 0. How to use this document

- **§1–§3** = context (goals, decisions, current code). Read once.
- **§4** = the target data model. Reference it from every backend phase.
- **§5** = repo conventions & gotchas you MUST honour. Read before writing code.
- **§6 = the phased plan.** This is the work. Phases are dependency-ordered (DB → backfill → types →
endpoints → reads → student UI → teacher UI → cleanup).
- **§7** = end-to-end verification matrix. **§8** = settled decisions (implement to them; don't re-litigate).

**This is one migration on one branch, deployed at the end.** Phases are review/checkpoint boundaries,
not independently deployable units — the app is only behaviourally complete after Phase 8 (Phase 9 is
cleanup). Each phase must still pass typecheck/lint/build; expect incomplete *runtime* behaviour between
phases (e.g. after Phase 4 the new tables are written but the student UI isn't repointed until Phase 6).

**Global verify commands** (run from repo root, Git Bash or PowerShell):

- Typecheck: `npx tsc --noEmit`  ·  Lint: `npm run lint`  ·  Build: `npm run build`
- One-off scripts (e.g. backfill): `npx tsx scripts/<name>.ts` (matches existing `scripts/` usage).

---

## 1. Goals

1. **Persistent tentative feedback until release.** When an assignment requires teacher approval, the
  student sees the **AI-generated (tentative) per-attempt score + feedback** after submitting,
   labelled *tentative / pending teacher review*, so they can decide whether to **retry**. This
   tentative result is **persisted and visible on every revisit** (across sessions) until the teacher
   releases — important for students who don't finish in one sitting. **Two surfaces behave
   differently:** (a) **per-attempt feedback** shows the tentative score + feedback (with the banner);
   (b) the **official submission grade total** stays **"pending review"** until release (the
   denormalized `graded_score` counts only released scores). After release both show the final
   (teacher-edited) values.
2. **Submission-level release.** The teacher reviews the **whole submission** (all questions/attempts),
  optionally edits, and clicks **one Release** that publishes everything at once. Release is **not**
   per-attempt. Approval-off → released automatically on submit.
3. **Selected attempt drives the grade.** Each question has one **selected** attempt whose score
  counts. **Default = the student's most recent (last) attempt.** The student may change it **only
   before they finish** (`submissions.status = 'completed'`); after that it's frozen for the student and
   the teacher may override. The counted total is **denormalized** so list/card views read one column.

## 2. Decisions locked in

- **Tentative is persisted and openly shown (no hiding, no redaction).** The AI result is written to the
**student-readable** attempt columns at eval time and shown with a clear *tentative* banner while the
submission is unreleased. Nothing is masked or filtered. (Supersedes the earlier in-memory-only /
redaction plans.)
- **One release flag = `submissions.feedback_released_at`** (null = held/tentative; set = final). This
is the **single source of truth** for "tentative vs final" for the whole submission and every attempt
under it. There is deliberately **no per-attempt `released_at`** column (it would always equal the
submission flag — redundant).
- **Official total stays pending until release.** `submission_questions.released_score` (→
`submissions.graded_score`) is NULL until release, so the headline grade reads "pending review" even
while per-attempt tentative feedback is visible (the (a)/(b) split in Goal 1).
- **Normalize** out of the `submissions.evaluations` JSONB into a three-level table hierarchy (§4).
- **Teacher edits are composed client-side and persisted only at Release** (one atomic action — no
"save draft"), so the student always sees the untouched **AI** tentative until release. A released
submission can be **re-opened** (clears the release flag → back to tentative) to amend and re-release.
- **Retry while pending:** allowed (subject to `max_attempts`).
- **Review gate:** the teacher must mark every question reviewed before Release; enforced server-side.
- **No notifications** for approvals/releases.

## 3. Current architecture (as-is) — what we're replacing

- All evaluation lives in `submissions.evaluations` JSONB: `{ [order]: { attempts: SubmissionAttempt[], selected_attempt?: number } }`.
- `SubmissionAttempt` (`src/types/submission.ts:22`): `attempt_number, score, max_score, rubric_scores, evaluation_feedback, timestamp, stale?, feedback_approved?, is_evaluating?`.
- Approval flag is **per-attempt** (`feedback_approved`); denormalized `has_pending_approvals`.
- `selected_attempt` is **vestigial** — written (default *best*, `evaluate/route.ts:300`,
`backgroundEvaluation.ts:125`) but never read for display; cards use `submissions.highest_score`.
- Student read = `getQuestionAttempts()` (`src/lib/queries/submissions.ts:519`) via **browser** Supabase
client reading the whole `evaluations` JSONB. Sole caller: `AssessmentShell.tsx` (via
`useQuestionAttempts`). Teacher read = `getSubmissionById()` (teacher panels only).
- Submit/evaluate (`src/app/api/evaluate/route.ts`): approval-off evaluates synchronously and appends
an attempt (`:289`); approval-on writes a 0-score stub + `after()` → `runBackgroundEvaluation()`
(`:191`). Denormalized via `computeDenormalizedFields()` (`src/lib/queries/submissions.ts:41`).
- Approve = `POST /api/submissions/approve-feedback` (+ `bulk-approve-feedback`) →
`src/lib/submissions/approveFeedback.ts`. Reset = `markAttemptsAsStale()`
(`src/lib/queries/submissions.ts:597`). Submission lifecycle: `submissions.status`
(`in_progress` | `completed`) + `submitted_at`.

---

## 4. Target data model (reference)

Three-level hierarchy mirroring the domain + two teacher-only companions. FKs give cascade deletes.

```
submissions                  (one per student per assignment)   — release flag + denormalized rollups
  └─ submission_questions      (one per question)               — selection + per-question released score
       └─ submission_attempts   (one per attempt)               — per-attempt displayable grade
            └─ attempt_ai_evaluations   (TEACHER-ONLY: original AI + model_meta)  — audit
  submission_question_reviews   (TEACHER-ONLY, per question)    — review gate
```


| table                         | grain                  | RLS                  | key columns                                                                                                                                                                                                          |
| ----------------------------- | ---------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `submission_questions`        | (submission, question) | student-readable     | `id`, `submission_id`, `question_order`, `selected_attempt_id` fk→attempts (null), `released_score` numeric **null until release**, `created_at`                                                                     |
| `submission_attempts`         | attempt                | student-readable     | `id`, `submission_question_id` fk, `attempt_number`, `max_score`, `stale` bool, `score` / `feedback` / `rubric_scores` (**the displayable grade — AI tentative at eval, teacher-final after release**), `created_at` |
| `attempt_ai_evaluations`      | attempt                | TEACHER-ONLY (audit) | `id`, `attempt_id` fk unique, `ai_score`, `ai_feedback`, `ai_rubric_scores` jsonb, `model_meta` jsonb, `created_at`                                                                                                  |
| `submission_question_reviews` | question               | **TEACHER-ONLY**     | `id`, `submission_question_id` fk unique, `reviewed_at`, `reviewed_by`                                                                                                                                               |


`submissions` gains: `feedback_released_at timestamptz null` (the single release flag; null = held) and
`graded_score numeric default 0` (= Σ `submission_questions.released_score`, trigger-maintained).
Stop using: `feedback_approved`, `is_evaluating`, `has_pending_approvals`, and the `evaluations` JSONB.

**Selection is an FK** (`submission_questions.selected_attempt_id`), not an `is_selected` boolean — one
atomic update, exactly-one-per-question by design.

**Tentative vs final is a submission-level fact:** an attempt's grade is **tentative** when its
submission's `feedback_released_at IS NULL` *and* the assignment requires approval; otherwise **final**.
The grade columns on `submission_attempts` always hold the current displayable value (the AI output
until release, the teacher-edited value after). The student read derives a convenience `released: boolean` per attempt from the submission flag (§6) — there is no stored per-attempt release column.

**Why `attempt_ai_evaluations` is teacher-only:** it preserves the **original** AI output (to compare
AI-vs-teacher after an edit) plus `model_meta`. It is **not** a security linchpin — the tentative grade
is shown openly — so a leak would be minor info disclosure, not a held-grade exposure. Lock it (and the
reviews table) to teachers anyway because students have no reason to read audit/model data; see §5.

---

## 5. Repo conventions & gotchas (read before coding)

1. **RLS default is wide-open `USING(true)`.** Existing submission-family tables (`submissions`,
  `submission_transcripts`, `chat_messages`, …) have policies like `FOR SELECT TO authenticated, anon  USING (true)`. **The two student-readable new tables follow this convention** (they're meant to be
   read by students; the tentative grade is shown openly, not hidden). **Lock the two TEACHER-ONLY
   tables** (`attempt_ai_evaluations`, `submission_question_reviews`) — they carry audit/`model_meta`
   and review progress students shouldn't read. Use the existing `is_class_co_teacher(uuid)` helper;
   reach the class by walking `attempt → submission_questions → submissions.assignment_id →  assignments.class_id`. Create one `SECURITY DEFINER` helper `is_submission_teacher(p_submission_id  text) returns boolean` and reuse it in both teacher-only policies. `assignments.assignment_id` is the
   **text** public id that `submissions.assignment_id` references; `assignments.class_id` is the uuid.
2. **Reads go through SWR hooks, not direct query imports.** ESLint `no-restricted-imports` forbids
  importing from `@/lib/queries/`** inside components — read via a hook in `src/hooks/swr/**`. Add/repoint
   hooks there; keep DB functions in `src/lib/queries/submissions.ts`.
3. **Two Supabase clients.** Browser client `createClient()` (inside `src/lib/queries/*` for client-driven
  SWR reads) vs server client `createServerSupabaseClient()` from `@/lib/supabase-server` (in
   `src/app/api/`** routes and server libs). New API routes use the **server** client.
4. **Migration naming.** `supabase/migrations/<UTC timestamp>_<snake_name>.sql`, lexicographically after
  the latest (`20260601000000_add_archived_class_status.sql`), e.g.
   `20260615000000_grading_normalized_schema.sql`.
5. **Submission lifecycle fields.** "Finished/submitted" (used to lock student selection) =
  `submissions.status = 'completed'`. The release flag is the separate `feedback_released_at`.
6. **No notifications.** Do not call `notifyFeedbackAvailable`; retire it if it ends up unused.
7. `**evaluations` legacy array format.** Old rows may store `evaluations` as a legacy array; existing
  code normalizes via `isNewFormat`/`convertToNewFormat`. The backfill (Phase 2) must handle both.
8. **Verify after every phase** (§0 commands). Prefer `npx tsc --noEmit` for fast feedback before a full
  `npm run build`.

---

## 6. Phased implementation plan

### Phase 1 — Database schema (migration)

**Objective:** create the four tables, the two `submissions` columns, indexes, RLS, and the
`graded_score` trigger. No app code yet.
**Files:** new `supabase/migrations/20260615000000_grading_normalized_schema.sql`.
**Steps:**

1. `ALTER TABLE submissions ADD COLUMN feedback_released_at timestamptz, ADD COLUMN graded_score numeric NOT NULL DEFAULT 0;`
2. Create `submission_questions`, `submission_attempts`, `attempt_ai_evaluations`,
  `submission_question_reviews` per §4 (FKs `ON DELETE CASCADE`).
3. Indexes: unique `(submission_id, question_order)` on questions; `(submission_id)`; unique
  `(submission_question_id, attempt_number)` on attempts; `(submission_question_id)` + partial
   `WHERE NOT stale`; unique `attempt_id` on ai_evaluations; unique `submission_question_id` on reviews.
4. RLS — student-readable tables (`submission_questions`, `submission_attempts`): enable RLS + `USING(true)`
  SELECT/INSERT/UPDATE for `authenticated, anon` (match existing convention). Teacher-only tables:
   enable RLS + create `is_submission_teacher(text)` `SECURITY DEFINER` helper and policies
   `USING (is_submission_teacher(<submission_id resolved from the row>))`.
5. Trigger `recompute_submission_rollups()` on `submission_attempts` (INS/UPD/DEL) and
  `submission_questions` (INS/UPD/DEL). It resolves the affected `submission_id` from the changed row
   (attempts → join `submission_questions`) and sets, for that submission:
   `graded_score = COALESCE(Σ submission_questions.released_score, 0)`, `has_attempts`, `total_attempts`,
   `questions_attempted_count`, and `max_score = Σ per-question max_score` (one non-stale attempt's
   `max_score` per question). Counts use **non-stale** attempts only.

**Sketch (abbreviated — fill in remaining columns from §4):**

```sql
create table public.submission_questions (
  id uuid primary key default gen_random_uuid(),
  submission_id text not null references public.submissions(submission_id) on delete cascade,
  question_order int not null,
  selected_attempt_id uuid,            -- FK added after attempts table exists
  released_score numeric,              -- null until release
  created_at timestamptz not null default now(),
  unique (submission_id, question_order)
);
create table public.submission_attempts (
  id uuid primary key default gen_random_uuid(),
  submission_question_id uuid not null references public.submission_questions(id) on delete cascade,
  attempt_number int not null,
  max_score numeric not null default 0,
  stale boolean not null default false,
  score numeric, feedback text, rubric_scores jsonb,   -- displayable grade (tentative→final)
  created_at timestamptz not null default now(),
  unique (submission_question_id, attempt_number)
);
alter table public.submission_questions
  add constraint submission_questions_selected_attempt_fk
  foreign key (selected_attempt_id) references public.submission_attempts(id) on delete set null;

create table public.attempt_ai_evaluations (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null unique references public.submission_attempts(id) on delete cascade,
  ai_score numeric, ai_feedback text, ai_rubric_scores jsonb, model_meta jsonb,
  created_at timestamptz not null default now()
);
create table public.submission_question_reviews (
  id uuid primary key default gen_random_uuid(),
  submission_question_id uuid not null unique references public.submission_questions(id) on delete cascade,
  reviewed_at timestamptz not null default now(),
  reviewed_by uuid
);

-- TEACHER-ONLY lockdown helper (reused by both teacher-only policies)
create or replace function public.is_submission_teacher(p_submission_id text)
returns boolean language sql security definer set search_path = public as $$
  select exists (
    select 1 from submissions s
    join assignments a on a.assignment_id = s.assignment_id
    where s.submission_id = p_submission_id and public.is_class_co_teacher(a.class_id)
  );
$$;
```

> Teacher-only policies resolve `submission_id` by joining up from the row, e.g.
> `attempt_ai_evaluations → submission_attempts → submission_questions.submission_id`.

**Done when:** migration applies cleanly; the four tables + two `submissions` columns exist; as a
non-teacher, `attempt_ai_evaluations`/`submission_question_reviews` return zero rows while a co-teacher
sees them; `submission_questions`/`submission_attempts` are readable by anyone (convention).
**Verify:** apply the migration (Supabase CLI / your usual flow) and run the RLS spot-check above. No app
build needed yet.

---

### Phase 2 — Backfill script

**Objective:** populate the new tables from existing `submissions.evaluations` so nothing is lost.
**Files:** new `scripts/backfill-normalized-grading.ts` (run with `npx tsx`).
**Steps (idempotent — safe to re-run):** for each submission, normalize `evaluations` (handle the legacy
array via the same `isNewFormat`/`convertToNewFormat` logic), then per question insert a
`submission_questions` row and per attempt a `submission_attempts` row. Map:

- For every attempt, copy its legacy `score/feedback/rubric_scores` into the `submission_attempts` row
(this is the displayable grade in both states).
- `selected_attempt_id` ← the **last** non-stale attempt (decision §8.1 — last-attempt everywhere;
ignore the legacy `selected_attempt`).
- **Released** legacy submissions (no attempt has `feedback_approved === false`) → set
`submissions.feedback_released_at`; set each question's `released_score` = its **selected (last)**
attempt's score; insert a `submission_question_reviews` row per question (historical = reviewed).
(Writing `attempt_ai_evaluations` for these is optional — the historical stored value already folds in
any teacher edits, so the "original AI" isn't separable.) NOTE: because selection is last-not-best,
`graded_score` may differ from the legacy `highest_score` — accepted per §8.1 (pre-launch).
- **Held** legacy submissions (some attempt `feedback_approved === false`) → leave
`feedback_released_at` + every question's `released_score` NULL (still tentative); also write the AI
result into `attempt_ai_evaluations` (these held values are pure AI, not yet teacher-edited).
- legacy `is_evaluating === true` stubs → no AI row; leave the attempt grade columns NULL.
- `stale` carries over.
**Done when:** Σ legacy attempts == `submission_attempts` count; a released legacy submission has
`feedback_released_at` set + non-null `released_score` per question; a held one has `feedback_released_at`
NULL + NULL `released_score` but visible per-attempt grades; `graded_score` (trigger) counts only
released questions.
**Verify:** `npx tsx scripts/backfill-normalized-grading.ts` on a copy/branch DB; run the reconciliation
queries. Keep `evaluations` intact (cutover is Phase 9).

---

### Phase 3 — Types + query/helper layer

**Objective:** define the new TS shapes and the query/helper functions the endpoints will use. No
behaviour change to live routes yet.
**Files:** `src/types/submission.ts`; `src/lib/queries/submissions.ts`; new
`src/lib/submissions/grading.ts` (release/reopen/selection/review helpers, replacing `approveFeedback.ts`).
**Steps:**

1. Add `SubmissionQuestion` (`id, submission_id, question_order, selected_attempt_id, released_score,
  created_at`) and a new` SubmissionAttempt `shape (`id, submission_question_id, attempt_number,
   max_score, stale, score, feedback, rubric_scores, created_at`+ a derived`released: boolean`).  The legacy JSONB code stays live until Phase 9 — to avoid a big-bang type break, introduce the new  shapes alongside a` LegacySubmissionAttempt` alias for the still-live JSONB call sites.
2. Add query fns: `getQuestionAttemptsNormalized(submissionId, questionOrder)` (browser client; joins
  `submission_questions`→`submission_attempts`, returns attempts each carrying a derived
   `released = submission.feedback_released_at != null`, plus the question's `selected_attempt_id`), and
   server helpers for release/reopen/review/selection.
3. Pure helpers in `grading.ts`: review-gate check (which questions lack a review row), default-last
  selection, and the release write (set `feedback_released_at` + per-question `released_score`).

**Done when:** `npx tsc --noEmit` passes; new functions exported and reachable.
**Verify:** `npx tsc --noEmit`; `npm run lint`.

---

### Phase 4 — `/api/evaluate` route (synchronous + new tables)

**Objective:** write attempts to the new tables on submit; persist the tentative grade student-readable.
**Files:** `src/app/api/evaluate/route.ts`.
**Steps:**

1. Remove the approval branch (stub + `after()` + `runBackgroundEvaluation`, `:191`). Always evaluate
  synchronously (reuse the existing eval call from the approval-off path).
2. Upsert the `submission_questions` row for `(submission, question_order)`; insert a
  `submission_attempts` row (`attempt_number = existing count + 1`, `max_score`); insert an
   `attempt_ai_evaluations` row with the AI result + `model_meta` (use the existing
   `modelMetaFromResolved(evalModelConfig, evalKeySource)`); set the question's `selected_attempt_id` to
   the new attempt (default-last).
3. **Always copy the AI result → the attempt's student-readable `score/feedback/rubric_scores`.** Then
  branch on `feedback_requires_approval`:
  - **false** → set `submission_questions.released_score` and `submissions.feedback_released_at` (if
  null) → released immediately, counts toward the total.
  - **true** → leave `released_score` + `feedback_released_at` NULL → tentative (visible per-attempt,
  not counted).
4. Keep writing `submission_transcripts` (and `static_activity`) as today — they still key off
  `(submission_id, question_order, attempt_number)`.
5. Response: return the created attempt (score/feedback + the derived `released`) so the client renders
  immediately; the value is persisted, so a later refetch returns the same tentative until release.

**Done when:** submitting creates the expected rows; approval-off → `feedback_released_at` +
`released_score` set; approval-on → both NULL but the attempt's `score/feedback` are persisted and
re-readable; the trigger has updated `graded_score`.
**Verify:** `npx tsc --noEmit`; exercise both modes and inspect the new rows + the response body.

---

### Phase 5 — Release / reopen / review / selection endpoints

**Objective:** server-side release with the review gate, plus reopen, review-marking, and selection.
**Files:** new `src/app/api/submissions/release/route.ts`,
`src/app/api/submissions/review-question/route.ts`, `src/app/api/submissions/select-attempt/route.ts`.
Retire `approve-feedback/route.ts` + `bulk-approve-feedback/route.ts` (and `approveFeedback.ts`) once
callers are migrated (Phase 8).
**Steps:**

- **release** (`POST`): input `submissionId` + optional per-attempt edits `{ attemptId, score, feedback, rubric_scores }[]` and per-question `selected_attempt_id` overrides. Apply selection overrides first;
**enforce the review gate** — every `submission_questions` row with ≥1 non-stale attempt must have a
`submission_question_reviews` row, else `409 { error: "unreviewed_questions", questionOrders }`. Then
apply the per-attempt edits to `submission_attempts.score/feedback/rubric_scores`; set each question's
`released_score` = its **selected** attempt's score; set `submissions.feedback_released_at = now()`.
(No per-attempt flag to flip — the submission flag flips everything to "final".) **No notification.**
- **reopen** (`POST` — or a `released:false` variant of release): clear `submissions.feedback_released_at`
and every question's `released_score` → the submission reverts to tentative so the teacher can amend,
then release again. Teacher-only.
- **review-question** (`POST`): `{ submissionId, questionOrder, reviewed }` → upsert/delete the review
row (`reviewed_by` = current teacher). Teacher-only.
- **select-attempt** (`PATCH`): `{ submissionId, questionOrder, attemptNumber }` → set
`selected_attempt_id`. Student allowed only while `submissions.status <> 'completed'`; teacher allowed
anytime and **deletes that question's review row** (content changed → re-review).
**Done when:** release of a fully-reviewed submission publishes grades; a partially-reviewed one returns
409 with the unreviewed orders; reopen reverts to tentative; teacher selection change clears the review.
**Verify:** `npx tsc --noEmit`; endpoint tests for the 409 path, the happy path, and reopen.

---

### Phase 6 — Student read path + SWR hooks

**Objective:** point the student UI at the normalized tables. Tentative is persisted, so **no in-memory
cache trick is needed** — a plain refetch returns the tentative grade until release.
**Files:** `src/lib/queries/submissions.ts` (repoint `getQuestionAttempts` to the normalized read, or
swap callers to `getQuestionAttemptsNormalized`); `src/hooks/swr/useSubmissions.ts` (the
`useQuestionAttempts` fetcher + a selection mutate). `markAttemptsAsStale` updated to set attempts
`stale`, clear `selected_attempt_id` + `released_score` + review rows + `feedback_released_at`, and set
`submissions.status = 'in_progress'`.
**Steps:** the read returns attempts joined to their question, each carrying its grade columns and the
derived `released` boolean (`= submission.feedback_released_at != null`). Tentative attempts
(`released === false` while the assignment requires approval) carry the AI grade → the UI shows the
tentative banner; released attempts show final values. Normal SWR revalidation is fine.
**Done when:** revisiting/reloading a held question shows the **tentative** grade + banner from the DB
(not blank); a released question shows final; reset returns the submission to in-progress.
**Verify:** `npx tsc --noEmit`; `npm run lint` (no restricted-import violations); manual revisit/reload.

---

### Phase 7 — Student UI

**Objective:** show the persistent tentative per-attempt feedback whenever unreleased; keep the official
total "pending review" until release; allow retry while pending; add the attempt selector.
**Files:** `src/components/Shared/AssessmentShell.tsx`,
`src/components/Shared/QuestionCompletionPanel.tsx`, new
`src/components/Shared/FeedbackTentativeBanner.tsx`, `src/components/Shared/FeedbackPendingBanner.tsx`
(reword).
**Steps:**

1. `AssessmentShell`: drop the `submittingForApproval` → `FeedbackPendingBanner` short-circuit (`:328`,
  `:511`); the student now waits for synchronous eval (keep the `isEvaluating` spinner; "Scoring your
   answer…" copy is fine). No `justSubmitted` tracking — tentative is decided by persisted state.
2. `QuestionCompletionPanel`: drive `tentativeReview` off the attempt's derived `released === false`
  (assignment requires approval). In that state show the per-attempt score + feedback under
   `**FeedbackTentativeBanner`** **both right after submit and on every revisit**. Released attempts show
   final values. Change `canTryAgain` to depend only on `remainingAttempts` (retry no longer gated on
   pending). **Banner copy must distinguish "tentative score for this attempt" from "your grade"** so
   students don't read the tentative number as final.
3. **Official total stays pending:** wherever the submission's headline grade/total renders, show
  "pending review" while `submissions.feedback_released_at` is NULL (it's driven by `graded_score`,
   which excludes unreleased questions) — even though per-attempt tentative feedback is visible.
4. Add the per-question attempt selector (radio/segmented), defaulting to last, editable only while
  `status <> 'completed'`, calling `select-attempt`.

**Done when:** approval-on submit shows tentative + banner + working Try Again; **leaving and returning
(or reloading) still shows the tentative feedback**; the headline total reads "pending review" until
release; the selector changes the counted attempt pre-finish.
**Verify:** `npx tsc --noEmit`; `npm run build`; manual student flow incl. revisit-after-leaving.

---

### Phase 8 — Teacher UI (release + reopen + review gate + selection)

**Objective:** one Release action gated on full review, with editing, selection override, reopen, progress.
**Files:** `src/components/Teacher/Assignments/EditableAttemptGradingForm.tsx`,
`SubmissionGradingPanel.tsx`, `SubmissionsListSection.tsx`, `SubmissionsTab.tsx`. Update any imports of
the retired approve routes/helpers.
**Steps:**

1. The grading form edits the attempt's current grade (`submission_attempts.score/feedback/rubric_scores`
  — which is the AI tentative before release, the teacher value after); the **original AI** is available
   from `attempt_ai_evaluations` for an optional "compare to AI" affordance. Edits feed the release
   payload. Add a per-question **Mark reviewed** toggle (auto-checks on edit-save) calling
   `review-question`.
2. `SubmissionGradingPanel`: show **"Reviewed X / N"**, per-question selected-attempt override, and the
  release state (Held / Released). The **Release submission** button replaces "Save & Approve";
   disabled until all questions reviewed; on `409` surface the remaining questions. When released, show a
   **Re-open to amend** action calling the reopen endpoint.
3. Lists: "Release all" runs the release per submission, skipping/flagging not-fully-reviewed ones.
  Pending indicator = `feedback_released_at is null` (replaces `has_pending_approvals`).

**Done when:** Release is blocked until fully reviewed (UI + server 409); editing + Release publishes;
reopen reverts to tentative; re-selecting after review re-gates that question.
**Verify:** `npx tsc --noEmit`; `npm run build`; manual teacher flow incl. the multi-question gate + reopen.

---

### Phase 9 — Cleanup & cutover

**Objective:** remove the JSONB code paths once everything reads/writes the new tables.
**Files:** delete `src/lib/backgroundEvaluation.ts`; delete the `approve-feedback` +
`bulk-approve-feedback` routes + `src/lib/submissions/approveFeedback.ts`; remove
`computeDenormalizedFields(evaluations)`, the JSONB
`selected_attempt`/`feedback_approved`/`is_evaluating`/`has_pending_approvals` usages, the
`LegacySubmissionAttempt` alias, and all `evaluations` reads/writes.
**Do not drop the `evaluations` column in this phase** — keep it intact as the rollback escape hatch
(§8.3); schedule a separate follow-up migration to drop it after a soak period.
**Done when:** no references to the removed symbols remain (`grep` clean); app builds; the full §7 matrix
passes.
**Verify:** `npm run lint && npx tsc --noEmit && npm run build`; grep for `evaluations`,
`feedback_approved`, `runBackgroundEvaluation`, `approve-feedback` → only the migration/backfill remain.

---

## 7. End-to-end verification matrix

Run after Phase 8 (and again after Phase 9). Each row maps to the phase(s) that implement it.

1. Approval **off**: submit → immediate final score/feedback; revisit shows same; retry works. (P4,P6,P7)
2. Approval **on**: submit → per-attempt tentative score/feedback + banner; the headline total reads
  "pending review"; retry available/works. (P4,P7)
3. Approval **on**, **leave and return / reload** → the per-attempt tentative feedback is **still
  visible** (persisted) with the banner; the headline total still "pending review". (P4,P6,P7)
4. Approval **on**, RLS spot-check: as a non-teacher, `attempt_ai_evaluations` +
  `submission_question_reviews` return no rows; the tentative grade in `submission_attempts` *is*
   readable (by design). (P1)
5. Teacher edits + **Release** → student sees final everywhere; **no notification**. (P5,P8)
6. Multi-question: Release **blocked** until every question reviewed; "Reviewed X / N" tracks progress;
  server returns 409 if forced. (P5,P8)
7. Teacher re-selects a reviewed question's attempt → its review clears; Release re-gates. (P5,P8)
8. **Reopen** a released submission → reverts to tentative (headline "pending review" again); amend +
  re-release → student sees updated values. (P5,P8)
9. Selection default = last; student changes pre-finish → counted score follows; frozen once
  `status='completed'`; teacher override → wins. (P4,P5,P7)
10. `graded_score` reflects the **selected** (not best) attempt; pending (0/"pending review") before
  release. (P1,P4)
11. `max_attempts` reached while pending → retry blocked by the attempts limit, not by pending. (P7)
12. Reset → all stale, selection/reviews/release cleared, submission in-progress, no notification. (P6)
13. Backfill reconciliation: released legacy → `feedback_released_at` + per-question `released_score`;
  held legacy → tentative (flags NULL) + `attempt_ai_evaluations` rows; attempt counts match; selected
    = last per question (`graded_score` may differ from legacy `highest_score`, accepted §8.1). (P2)

---

## 8. Decisions (all resolved — do not re-litigate)

1. **Backfill selection = last-attempt everywhere.** Apply the new last-attempt rule to historical rows
  too. Pre-launch, no real grades to disturb, so retroactive normalization is acceptable — Phase 2.
2. **Public (anon) submissions:** the student-readable `USING(true)` convention is fine for the new
  student-readable tables. Nothing student-facing is hidden (the tentative grade is shown openly); the
   teacher-only tables hold only audit/`model_meta` + review state. No special handling required.
3. **Migration = hard cutover + keep the column.** Backfill, then switch all reads/writes in one deploy.
  **Keep the legacy `evaluations` column intact** as a rollback escape hatch; drop it in a later
   follow-up migration after a soak period — Phase 9. No dual-write.
4. **Review marking = both.** An explicit per-question "Mark reviewed" toggle **and** auto-mark on
  edit-save — Phase 8.
5. **No notifications** for approvals/releases (don't call `notifyFeedbackAvailable`).
6. **Tentative is persisted & student-readable** (not in-memory, not hidden): the AI grade is written to
  `submission_attempts` at eval time and shown with a *tentative* banner while
   `submissions.feedback_released_at` is NULL (approval required), so the student can see it on any
   revisit until release.
7. **One release flag.** `submissions.feedback_released_at` is the single source of truth for
  tentative-vs-final; there is **no** per-attempt `released_at` column. Release flips the whole
   submission; **reopen** clears the flag (+ per-question `released_score`) to amend and re-release.
8. **(a)/(b) split:** per-attempt tentative feedback is visible; the **official total** stays "pending
  review" (`released_score`/`graded_score` exclude unreleased questions) until release.
9. **Schema:** three-level normalized hierarchy (§4).
10. **Selection** is an FK (`selected_attempt_id`), default-last, student-locked at `status='completed'`,
  teacher-override.
11. `**graded_score`** maintained by a Postgres trigger; rollups stay denormalized on `submissions`.

