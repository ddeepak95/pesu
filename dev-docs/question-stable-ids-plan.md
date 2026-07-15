# Stable Question IDs + Attempt Session IDs

Implementation plan, written after a full exploration of the current schema on `usage-metering` (verified via Explore agent + direct reads this session — file:line references below reflect real code, not assumptions). Not yet implemented — this is the design doc to execute against.

## Context

This started from an AI-usage-metering investigation: `ai_invocations.question_order` goes stale whenever a teacher reorders questions in the assignment editor, because `order` is a plain array index — `AssignmentForm.tsx`'s reorder/delete handlers literally reassign `q.order = i` on every mutation. Investigation found this isn't just an `ai_invocations` problem: **no question anywhere in this schema has a stable identity at all.** `submission_questions`, `chat_messages`, `voice_messages`, `submission_transcripts`, `static_activity`, and a `bot_prompt_config.question_overrides` map are all keyed by raw `question_order` integers with no FK. A teacher reordering questions after a student has already submitted work can silently misattribute grading rows, prompt overrides, and chat history to the wrong question.

Confirmed full scope: give `Question` a real stable `id` (client-minted UUID, survives reorder — same pattern quizzes already use via `MCQQuestion.id`/`nanoid`), backfill all existing data, and re-key every affected table to use `question_id` instead of `question_order`. Also add `ai_invocations.attempt_id`, linked post-hoc after grading completes (same two-way-link pattern as the existing `linkInvocationToChatMessage`). Separately, also add `attempt_session_id` to distinguish a refreshed/abandoned session from a continuous one (see the dedicated section below) — foundational data capture only, no abandonment-detection logic or resume UI built in this pass.

**What happens to already-created assignments**: nothing breaks, nothing user-facing changes. A one-time SQL backfill stamps a stable `id` onto every existing question in every existing assignment (and every existing per-submission `generated_questions` snapshot), keyed by whatever order it's currently in. From that point on, `id` stays fixed even when `order` keeps changing.

Quiz precedent to mirror: `src/types/quiz.ts` (`MCQQuestion.id`), `src/components/Teacher/Quizzes/QuizForm.tsx` (`nanoid(10)` mint on add, `ensureQuestionIds` legacy-backfill-on-load helper), `src/utils/quizScoring.ts` (`question.id || \`order-${question.order}\`` fallback). We use `crypto.randomUUID()` instead of `nanoid(10)` so client-minted and DB-backfilled (`gen_random_uuid()`) ids are the same shape.

## Migration design (`supabase/migrations/20260714020000_question_stable_ids.sql`)

Purely additive — new nullable columns, backfill, new unique constraints alongside the old ones. Nothing dropped. A follow-up cleanup migration (dropping the legacy `question_order` unique constraints/columns once the new path is confirmed stable in production) is explicitly deferred, not part of this pass.

1. **New columns** (all nullable, no FK — mirrors how `question_order` itself has no FK today, since the id lives inside a jsonb array element, not a relational row):
   ```sql
   alter table public.submission_questions       add column if not exists question_id uuid;
   alter table public.chat_messages               add column if not exists question_id uuid;
   alter table public.voice_messages              add column if not exists question_id uuid;
   alter table public.submission_transcripts      add column if not exists question_id uuid;
   alter table public.static_activity             add column if not exists question_id uuid;
   alter table public.submission_session_audio    add column if not exists question_id uuid;
   alter table public.ai_invocations              add column if not exists question_id uuid;
   alter table public.ai_invocations              add column if not exists attempt_id  uuid;
   alter table public.app_logs                    add column if not exists question_id uuid;
   alter table public.attempt_ai_evaluations       add column if not exists ai_invocation_id uuid references public.ai_invocations(id) on delete set null;
   ```

2. **Backfill `assignments.questions[*].id` and `submissions.generated_questions[*].id`** — idempotent (guarded by `elem ? 'id'`):
   ```sql
   update public.assignments
   set questions = (
     select jsonb_agg(
       case when elem ? 'id' then elem
            else elem || jsonb_build_object('id', gen_random_uuid()::text)
       end order by ord
     )
     from jsonb_array_elements(questions) with ordinality as t(elem, ord)
   )
   where questions is not null and jsonb_typeof(questions) = 'array' and jsonb_array_length(questions) > 0;

   update public.submissions
   set generated_questions = (
     select jsonb_agg(
       case when elem ? 'id' then elem
            else elem || jsonb_build_object('id', gen_random_uuid()::text)
       end order by ord
     )
     from jsonb_array_elements(generated_questions) with ordinality as t(elem, ord)
   )
   where generated_questions is not null and jsonb_typeof(generated_questions) = 'array' and jsonb_array_length(generated_questions) > 0;
   ```

3. **Rekey `bot_prompt_config.question_overrides`** (order-index keys → id keys). Must run after step 2, same migration/transaction:
   ```sql
   with question_id_map as (
     select a.id as assignment_pk, (ord - 1)::int as question_order, (elem->>'id') as question_id
     from public.assignments a, jsonb_array_elements(a.questions) with ordinality as t(elem, ord)
     where a.bot_prompt_config ? 'question_overrides'
   ),
   remapped as (
     select a.id as assignment_pk, jsonb_object_agg(qim.question_id, ov.value) as new_overrides
     from public.assignments a
     join jsonb_each(a.bot_prompt_config->'question_overrides') as ov(key, value) on true
     join question_id_map qim on qim.assignment_pk = a.id and qim.question_order = (ov.key)::int
     where a.bot_prompt_config ? 'question_overrides'
     group by a.id
   )
   update public.assignments a
   set bot_prompt_config = jsonb_set(a.bot_prompt_config, '{question_overrides}', r.new_overrides, true)
   from remapped r
   where r.assignment_pk = a.id;
   ```
   A stale override key pointing at an out-of-range index is silently dropped (matches current inert behavior).

4. **Backfill `submission_questions.question_id` / `chat_messages.question_id` / etc.** Source array is `coalesce(submission.generated_questions, assignment.questions)` — mirrors the client's own resolution (`AssignmentResponseCore.tsx`'s `sortedQuestions`: dynamic-enabled → `generatedQuestions`, else → `assignmentData.questions`):
   ```sql
   with submission_question_source as (
     select s.submission_id, coalesce(s.generated_questions, a.questions) as questions
     from public.submissions s
     left join public.assignments a on a.assignment_id = s.assignment_id
   ),
   question_id_lookup as (
     select sqs.submission_id, (ord - 1)::int as question_order, (elem->>'id') as question_id
     from submission_question_source sqs, jsonb_array_elements(sqs.questions) with ordinality as t(elem, ord)
     where sqs.questions is not null
   )
   update public.submission_questions sq
   set question_id = qil.question_id::uuid
   from question_id_lookup qil
   where qil.submission_id = sq.submission_id and qil.question_order = sq.question_order and sq.question_id is null;
   ```
   Repeat identically (same `question_id_lookup` CTE, materialize once as a temp table to avoid recomputing) for `chat_messages`, `voice_messages`, `submission_transcripts`, `static_activity`, `submission_session_audio` — each joined on `(submission_id, question_order)` directly. Rows where `question_order` is out of range of the resolved array keep `question_id = NULL` (pre-existing orphaned/historical data — not a live-data bug, verify the count is small per Verification below). `ai_invocations`/`app_logs` backfill is optional/low-priority — leave `NULL` for historical rows, rely on `question_order` for historical audit lookups.

5. **New unique constraints** (after backfill; old constraints stay untouched):
   ```sql
   alter table public.submission_questions   add constraint submission_questions_question_id_unique unique (submission_id, question_id);
   alter table public.submission_transcripts add constraint submission_transcripts_question_id_unique unique (submission_id, question_id, attempt_number);
   alter table public.static_activity        add constraint static_activity_question_id_unique unique (submission_id, question_id, attempt_number);
   ```
   NULLs are distinct in Postgres unique constraints, so pre-existing orphan rows don't violate these.

**Sequencing**: migration lands and backfill completes *before* the app-code deploy (atomic per-deployment, no code straddles two schema versions). App code cuts over to `question_id` as the primary key in one deploy — no gradual dual-write phase in application logic (the DB schema coexists with both columns; the app just stops reading/writing `question_order` for identity, keeps writing it for display/debugging). Legacy `question_order` columns/constraints are **not** dropped in this pass — a separate future cleanup migration, deliberately deferred.

## Type changes

- **`src/types/assignment.ts`**: `Question` gets `id: string` (non-optional — same rigor as `MCQQuestion.id`, forces every read site to be updated deliberately). `BotPromptConfig.question_overrides`: `Record<number, ...>` → `Record<string, ...>`.
- **`src/types/submission.ts`**: `SubmissionQuestion`, `SubmissionTranscript`, `StaticActivity`, `TeacherGradingQuestion` each get `question_id: string` alongside the existing `question_order: number` (kept for display/debugging, no longer identity).
- **`src/lib/ai/gateway/model.ts`**: `AiCallContext` gets `questionId?: string | null` and `attemptId?: string | null`.
- **`src/lib/ai/logging/types.ts`**: `AiInvocationDomainContext` gets the same two fields.
- **`src/lib/ai/logging/recordInvocation.ts`**: `persistAiInvocationStart`'s insert gains `question_id`/`attempt_id`; new exported `linkInvocationToAttempt(invocationId, attemptId)`, directly modeled on the existing `linkInvocationToChatMessage`.

## `attempt_id` plumbing (required new capability, not just a type change)

`evaluateSubmission()` calls `handle.generateStructured(...)` internally but the AI invocation id it produces was never exposed back to the caller. Add a side-channel getter, minimal blast radius (public `generateStructured` signature is unchanged — every other caller of it is unaffected):

- **`src/lib/ai/gateway/structured.ts`**: `generateStructuredInternal` returns `{ output, invocationId }` instead of just `T`. `invocationId` is the **successful attempt's** invocation id — the `invocationId` already in scope at the success return (currently `structured.ts:117`), *not* the `firstInvocationId` retry anchor. On the provider-retry path these differ; we want the one that actually produced the output, and its `retry_of` still chains back to any retries for cost traversal.
- **`src/lib/ai/gateway/model.ts`**: `MeteredTextModel` gains `readonly lastInvocationId: string | null`. `MeteredTextModelImpl.generateStructured()` unwraps `{output, invocationId}`, stores `invocationId` on `this._lastInvocationId` (**overwriting on every call**), still returns `output` (public signature unchanged).
- **Semantics note — `evaluateSubmission` calls `generateStructured` in a loop.** `src/lib/ai/evaluateSubmission.ts:113-135` regenerates `feedback_output` up to `MAX_FEEDBACK_DOC_ATTEMPTS` (2) times; each iteration is a **fresh top-level invocation**, *not* chained to the previous via `retry_of`. The loop `break`s on the first valid/used result, so the **last** `generateStructured` call is always the one whose output is graded. Because the model overwrites `_lastInvocationId` on every call, `lastInvocationId` after `evaluateSubmission()` returns correctly points at that used invocation. Any earlier (discarded) feedback-doc-regeneration invocation stays in `ai_invocations` as real, correctly-attributed cost — it is simply *not* linked to the attempt. This is intended, not a leak.
- **`src/app/api/evaluate/route.ts`**: after `evaluateSubmission()` returns and the `submission_attempts` row is created, read `evalHandle.lastInvocationId` and:
  - include it as `attempt_ai_evaluations.ai_invocation_id` on insert,
  - call `linkInvocationToAttempt(evalHandle.lastInvocationId, attemptId)` (plain `await`, this route is already synchronous end-to-end — no need for `after()`).

## File-by-file changes

**Assignment editor** (`src/components/Teacher/Assignments/AssignmentForm.tsx`):
- `handleAddQuestion`: new question gets `id: crypto.randomUUID()`.
- `handleMoveQuestionUp`/`handleMoveQuestionDown`: no change — only `.order` is reassigned, `.id` survives the array swap.
- `handleDeleteQuestion`: keep the `order` reindex (still needed for display/generation numbering). **Delete** the `question_overrides` index-shifting block entirely — replace with a simple delete-by-id (`delete overrides[deletedId]` if present, no shifting of surviving keys).
- `handleQuestionOverrideChange`: parameter renamed `questionOrder: number` → `questionId: string`; body unchanged (identity-agnostic object spread/delete).
- Render site: `question_overrides?.[question.id]` instead of `?.[question.order]`.
- Add `ensureQuestionIds()` legacy-backfill-on-load helper mirroring `QuizForm.tsx`'s exactly — belt-and-suspenders in case any assignment isn't caught by the DB backfill.
- `src/components/Teacher/Assignments/QuestionCard.tsx`: `onQuestionOverrideChange(question.id, override)` instead of `(question.order, override)`; update the prop type.

**Prompt interpolation** (`src/lib/promptInterpolation.ts`): `config.question_overrides?.[question.id]` — one lookup, delete the existing double-lookup order/string-cast workaround.

**Dynamic question generation** (`src/app/api/generate-dynamic-questions/route.ts`): `generateMergedQuestions`'s output loop already has `t = sorted[i]` as the exact 1:1 template for output slot `i` — add `id: t.id` to the `output.push({...})` literal. One line; no new branching needed regardless of static vs. dynamically-generated content.

**Evaluate route** (`src/app/api/evaluate/route.ts`, the flagship — most changes):
- **Name-collision rename (do this first).** The route already declares `const questionId = questionRow.id` at `evaluate/route.ts:198` — that is the normalized **`submission_questions.id` PK**, consumed immediately at line 203 (`.eq("submission_question_id", questionId)`) and again where `submission_attempts` is written. The new stable-question-UUID request field must also be called `questionId` (consistent with every other route), so it collides. **Rename the existing local `const questionId = questionRow.id` → `submissionQuestionId`** everywhere it's used in this route, freeing the name `questionId` for the incoming stable id. After the rename the route juggles three distinct ids cleanly: `submissionQuestionId` (row PK), `questionId` (stable question UUID), `attemptId` (`attemptRow.id`).
- `EvaluateRequestBody` gains `questionId: string`; destructure + validate (add to the missing-fields check).
- `evalContext: AiCallContext` gains `questionId` (known at construction time, unlike `attemptNumber`).
- `submission_questions` upsert (`evaluate/route.ts:182-189`): payload gains `question_id: questionId`, `onConflict: "submission_id,question_id"` (still writes `question_order` too, harmless); its `.select("id")` result still lands in `submissionQuestionId`.
- `submission_transcripts`/`static_activity` upserts: payload gains `question_id: questionId`, `onConflict` changes to include `question_id` instead of `question_order`.
- After grading: `attempt_ai_evaluations` insert gains `ai_invocation_id: evalHandle.lastInvocationId ?? null`; then `await linkInvocationToAttempt(evalHandle.lastInvocationId, attemptId)` if present.

**Every other AI-calling route** (`turn`, `generate-rubric-and-answer`, `action-retry`, `tts`, `transcribe`, `transliterate`): same three-part pattern — request body gains `questionId: string`, destructure, thread into every `AiCallContext`/`StartAiInvocationInput` object literal alongside `questionOrder` (grep `questionOrder` per file — every occurrence gets a `questionId` sibling). `turn/route.ts`'s 5 `insertChatMessage` calls also gain `question_id: questionId`.

**Lib-layer AI threading helpers** (found during plan verification — the "per route" framing above misses these intermediate helpers that the routes call into): `src/lib/multimodal/actions/dispatcher.ts` threads `questionOrder` through `args`/context into downstream calls (lines ~60/108/124) and `src/lib/ai/gateway/speech.ts` copies `questionOrder: context.questionOrder` into its call context (~line 72). Both need a `questionId` sibling carried through the same argument/context objects. Grep `questionOrder` in each and add a sibling at every occurrence.

**Query/grading helpers** — parameter-rename-and-filter-swap pattern (`questionOrder: number` → `questionId: string`, `.eq("question_order", ...)` → `.eq("question_id", ...)`), apply to:
- `src/lib/submissions/grading.ts`: `getQuestionId` (rename param, filter), `SelectionOverride`/`releaseSubmission` (questionOrder → questionId throughout), `getUnreviewedQuestionOrders` → rename to `getUnreviewedQuestionIds`, returns `string[]` not `number[]`. Trace the full chain: `ReleaseResult.unreviewedQuestionOrders` → `src/app/api/submissions/release/route.ts:47` (`questionOrders: result.unreviewedQuestionOrders` response field → rename to `questionIds`) → consumed in `SubmissionGradingPanel.tsx:251` (`data.questionOrders`), where the question-lookup becomes `assignment.questions.find(q => q.id === id)` instead of an array-index lookup.
- `src/lib/queries/submissions.ts`: `getTranscript`/`getLatestTranscript`/`getQuestionsWithAttempts`/`getQuestionAttemptsNormalized`/`getSubmissionGrading` — same swap. Keep `.order("question_order", ...)` for display sort (still valid as a sort key, just not identity).
- `src/lib/queries/chatMessages.ts` (`insertChatMessage`, `getChatMessages`), `src/lib/queries/voiceMessages.ts` (`getVoiceMessagesForAttempt`) — same swap.
- `src/app/api/multimodal/audio/utterance/route.ts`, `src/app/api/multimodal/audio/session-chunk/route.ts` — insert `question_id` on the DB row.
- `src/app/api/submissions/review-question/route.ts` and `src/app/api/submissions/select-attempt/route.ts` — request body `questionOrder: number` → `questionId: string` (destructure + missing-fields validation), thread into the grading helper calls (`setSelectedAttempt`, mark-reviewed).
- `src/app/api/multimodal/conversation/reset/route.ts` — request body `questionOrder` → `questionId`, threaded into the reset/delete filter (currently `question_order: questionOrder` at ~line 41).

**SWR hook layer** (`src/hooks/swr/useSubmissions.ts`) — the missing link between the query helpers above and the components below. `useChatMessages`, `useVoiceMessages`, `useTranscript`, `useQuestionAttemptsNormalized` each take `questionOrder: number | null`, **build the SWR cache key from it** (e.g. `["chatMessages", submissionId, questionOrder, attemptNumber]` at lines ~82/113/131/197), and forward it to the renamed query fns. Swap the param to `questionId: string | null`, update every cache-key array to key on `questionId`, and update the `getChatMessages`/`getVoiceMessagesForAttempt`/`getTranscript`/`getQuestionAttemptsNormalized` call args to match.

**Client components**:
- `src/components/Shared/AssessmentShell.tsx`: `/api/evaluate` fetch body gains `questionId: question.id`; `useQuestionAttemptsNormalized({ questionOrder: question.order, ... })` hook call gains/swaps to `questionId: question.id`. **Also `handleSelectAttempt` (~`AssessmentShell.tsx:494-507`)** calls `selectAttempt({ submissionId, questionOrder: question.order, attemptNumber })` — swap to `questionId: question.id` (matching the `select-attempt` route body change below) and update its `useCallback` dep array (`[submissionId, question.order]` → `question.id`). This is a third `question.order` site in this file beyond the evaluate-fetch and the hook.
- `src/components/Shared/AssessmentInputs/MultimodalInputArea.tsx`: every `formData.append("questionOrder", ...)` / JSON body `questionOrder: question.order` gets a sibling `questionId`/`question.id`; add `question.id` to any `useCallback` dependency array whose body now reads it.
- **`src/components/Shared/AssessmentInputs/StaticTextInputArea.tsx`** (found in the final `.order`-as-key sweep — **not in the original file map**): its `localStorage` draft key `` `static-${submissionId}-${question.order}` `` (`StaticTextInputArea.tsx:37-38`, read/written at 58/82/93/135) is keyed by `question.order` — a teacher reorder mid-draft would misattribute a student's saved static-text answer to the wrong question (the exact bug class this plan targets). Change the key to `` `static-${submissionId}-${question.id}` ``, and update the `useMemo` dep array accordingly. Also swap `subComponentId: String(question.order)` (line 33) → `String(question.id)` for stable activity-tracking identity. (Sibling `VoiceInputArea.tsx:56` has the same `subComponentId` pattern but is intentionally left alone per the legacy-voice out-of-scope note.) One-time localStorage-key migration is unnecessary — a stale draft under the old order-key simply isn't found and the student re-drafts; acceptable for ephemeral client draft state.
- `src/components/Shared/AssignmentResponseCore.tsx`: `questionsWithAttempts.has(sortedQuestions[i].order)` and the `answers: Record<number, string>` draft-state keyed by `currentQuestion.order` — both are additional "order as identity" spots found during plan review (not caught by the original exploration pass), swap to `.id`/`Record<string, string>`.
- **Student/Public/Preview response siblings** (`src/components/Student/StudentAssignmentResponse.tsx`, `src/components/Public/PublicAssignmentResponse.tsx`, `src/components/Teacher/Assignments/AssignmentPreviewResponse.tsx`) — each builds a `reconstructedAnswers[t.question_order]` map from transcripts (same "order-as-Record-key" class as `AssignmentResponseCore` above). Key these by `t.question_id` instead, and resolve the display question by `q.id` rather than array index. Three separate files, identical pattern.

**Teacher grading / review UI** (this is where the flagship "reorder after grading" bug actually manifests, so it must be re-keyed):
- `src/components/Teacher/Assignments/SubmissionGradingPanel.tsx`: currently derives `questionOrder = currentQuestion?.order` (~line 90) and matches the grading row via `grading?.questions.find(q => q.question_order === questionOrder)` (~line 117). Swap to `currentQuestion?.id` and match on `q.question_id`. Also update the `markReviewed`/`review-question` and `select-attempt` fetch bodies to send `questionId`, and the `data.questionOrders` consumer (~line 251) per the release-chain note above.
- `src/components/Teacher/Assignments/SubmissionContentPanel.tsx`: passes `currentQuestion?.order` into the `useChatMessages`/`useVoiceMessages`/`useTranscript` hooks (~lines 100–126) — swap to `currentQuestion?.id` once those hooks take `questionId`.

No new client-side resolution logic needed anywhere — `question: Question` already flows down as a prop everywhere via `AssignmentResponseCore` → `AssessmentShell` → `MultimodalInputArea`; once both `assignments.questions` and `submissions.generated_questions` carry `.id`, every existing prop-threading site already has the right value.

**Storage path — explicit exclusion**: `session-chunk/route.ts`'s Firebase Storage path (`voice-recordings/${submissionId}/${questionOrder}/${attemptNumber}/...`) stays keyed by `question_order`, unchanged. It's an external system with no atomic rename; nothing reads identity back out of the path (the URL is persisted in the DB row, not reconstructed). The DB row (`submission_session_audio`) still gets a proper `question_id` column for any real join/query need.

**Explicit out-of-scope call sites** (touch `question_order`/`questionOrder` but deliberately left alone — decisions, not oversights):
- **Legacy voice input** (`src/components/Shared/AssessmentInputs/VoiceInputArea.tsx:194`, `question_order: question.order`): voice is retired-but-kept for legacy assignments; not migrated in this pass. If a future pass revives voice as identity-critical, re-key it then.
- **Surveys** (`src/types/survey.ts`, `src/components/Teacher/Surveys/SurveyResponsesTab.tsx`, `src/app/student/classes/[classId]/surveys/[surveyId]/SurveyDetailClient.tsx`): a separate feature domain with its own `question_order`, unrelated to assignment `Question` identity. Out of scope.
- **Display-only placeholders** (`src/lib/promptTemplates.ts`, `src/components/Teacher/Assignments/PromptPreview.tsx`): `{{question_order}}` is the human-facing question *number* shown to student/AI, not identity — correctly left as `question_order`.
- **Audit logging** (`src/lib/logging/appLog.ts`, `src/lib/queries/appLogs.ts`, `src/components/Platform/AppLogsTable.tsx`): `app_logs.question_order` is audit-trail context. The new `app_logs.question_id` column is added but backfill is low-priority (per Migration step 4). Open decision to make during implementation: whether `appLog()`'s helper input (`appLog.ts:24/64`) should dual-write a `questionId` sibling going forward, or keep `question_order` only for logs.

**Completeness check required during implementation**: a follow-up verification sweep across all 40 files touching `question_order`/`questionOrder` found ~10 additional identity call sites beyond the original map — the SWR hook layer (`useSubmissions.ts`), the teacher grading/review UI (`SubmissionGradingPanel.tsx`, `SubmissionContentPanel.tsx`), three submissions API routes (`review-question`, `select-attempt`, `conversation/reset`), the release-result chain, the three transcript-answer reconstruction siblings, and two lib-layer AI threading helpers (`dispatcher.ts`, `speech.ts`) — all now folded into the sections above, alongside the explicit out-of-scope list. The surface is large enough that a final `grep -rn "question_order\|questionOrder" src/` sweep (plus a grep for bare `.order` used as a Set/Record/lookup key on a `Question`-typed value) must still be run at the end of implementation to confirm every remaining occurrence is either migrated or on the explicit out-of-scope list before considering this complete. **This sweep was run during plan verification**: the `question_order`/`questionOrder` grep returned exactly the 40 files mapped above (all accounted for — migrated or explicitly out-of-scope). The bare-`.order`-as-key grep additionally surfaced one file the identifier-based grep missed — `StaticTextInputArea.tsx` (`localStorage` draft key + `subComponentId` keyed by `question.order`, now folded into Client components above, making 41 files total) — and confirmed `promptInterpolation.ts:285`'s `question.order === 0` is positional first-question detection (correctly left as `order`, not identity) and `ProfileFieldsSection.tsx:76`'s `Record<number>` is unrelated profile-field state. Re-run both greps once more at the end of implementation as the final gate.

## Verification (no live Supabase in this session — same constraint as the rest of this branch's work)

**SQL to hand-verify against a staging/scratch copy before applying anywhere real:**
1. Run each backfill UPDATE, sanity-check row counts.
2. `select count(*) from assignments where questions is not null and jsonb_array_length(questions) > 0 and exists (select 1 from jsonb_array_elements(questions) e where not (e ? 'id'));` → expect `0`.
3. `select count(*) from submission_questions where question_id is null;` (and same for chat_messages/voice_messages/submission_transcripts/static_activity) → expect a small, explainable number (orphans), not a large fraction. If large, investigate the join before proceeding (likely `assignments.assignment_id` join-key mismatch, not genuinely unresolvable data).
4. `select bot_prompt_config->'question_overrides' from assignments where bot_prompt_config ? 'question_overrides' limit 20;` before/after step 3 of the migration — confirm keys look like UUIDs post-migration and entry count is preserved (modulo intentionally-dropped stale keys).
5. `select conname from pg_constraint where conrelid = 'submission_questions'::regclass;` → confirm both old and new unique constraints coexist.

**Manual click-through after deploying app code:**
1. Open an existing assignment (≥3 questions) in the editor, confirm it loads (validates `ensureQuestionIds` + backfill consistency). Reorder questions with a bot-prompt override set, save, reload — confirm the override followed the reordered question.
2. Delete a question with a subsequent question's override set — confirm the surviving override stays correctly attached (the exact bug class this fixes).
3. Complete a full assessment as a student, submit; confirm `submission_questions`/`chat_messages`/`voice_messages`/`submission_transcripts` all have non-null `question_id`.
4. Grade/release the submission; confirm `ai_invocations.question_id`/`attempt_id` populated and `attempt_ai_evaluations.ai_invocation_id` points back correctly.
5. Reorder the assignment's questions *after* a graded submission exists, reopen the teacher grading view for that old submission — confirm scores/feedback still line up with the correct question text (the original bug this whole investigation started from).
6. Dynamic-questions assignment: trigger regeneration, confirm `submissions.generated_questions[*].id` matches `assignments.questions[*].id` 1:1.
7. Standard repo checks: `npx tsc --noEmit`, `npm run lint`, `npm run validate:ai-metering`, full `npm run build`.

## Addition: `attempt_session_id` (distinguish refreshed/abandoned sessions from continuous ones)

**Problem this solves**: `attempt_number` only increments when a `submission_attempts` row is created (i.e., at grading time). Everything that happens *before* grading — the whole in-progress conversation — shares one `attempt_number` no matter how many times the student refreshes the page. A refresh today is invisible in the data: there's no way to tell "one continuous session" from "three separate sessions that happened to share attempt_number 3, two of which were abandoned."

**Scope**: capture the id everywhere (foundation for future analysis/resume work), no abandonment-detection logic or resume UI built now. New `attempt_sessions` table (not just a bare column), since a real row per session is more directly queryable ("how many sessions did this attempt have before completion") than reconstructing session boundaries from scattered columns.

### New table

```sql
create table if not exists public.attempt_sessions (
  id uuid primary key,                 -- client-minted (crypto.randomUUID()), not server-generated
  submission_id text not null references public.submissions(submission_id) on delete cascade,
  question_id uuid,                    -- no FK, same reasoning as question_id elsewhere (lives in a jsonb array, not a row)
  attempt_number integer not null,
  started_at timestamptz not null default now()
);
create index if not exists attempt_sessions_submission_idx
  on public.attempt_sessions (submission_id, question_id, attempt_number);

alter table public.attempt_sessions enable row level security;
-- Mirror the existing permissive convention on chat_messages/submission_transcripts
-- (same migration, remote_schema.sql:3930-3978) — actual access control for a
-- submission is enforced elsewhere in the app, not via RLS on these interaction tables.
create policy "Allow public to create attempt sessions" on public.attempt_sessions
  for insert to authenticated, anon with check (true);
create policy "Allow public to read attempt sessions" on public.attempt_sessions
  for select to authenticated, anon using (true);
```

`id` is client-minted (not `default gen_random_uuid()`) — same precedent as `chat_messages.id` already being client-supplied on insert (`insertChatMessage`'s `onConflict: "id"` upsert path) — because the session id needs to exist client-side *before* the row is created, so it can be threaded into the very first chat/transcribe/turn call without waiting on a round trip.

### New column: `session_id uuid`

Added to the same table set `question_id` touches: `chat_messages`, `voice_messages`, `submission_transcripts`, `static_activity`, `ai_invocations`, `app_logs`.

- On `chat_messages`/`voice_messages`/`submission_transcripts`/`static_activity` — add a **real FK** to `attempt_sessions(id)` (`on delete set null`). Unlike `question_id` (which references a jsonb array element with no backing row to FK against), `attempt_sessions` is a real table, so a genuine FK is possible and adds real integrity value here. **The FK is kept — the race it would otherwise create is eliminated by the on-demand `ensureAttemptSession` upsert (see below), not by dropping the FK.**
- On `ai_invocations`/`app_logs` — nullable, **no FK**, same convention as every other audit-only column in this plan (resilient to a session-creation call racing/failing without blocking the AI call it's describing).

### FK safety: on-demand `ensureAttemptSession` upsert

Postgres checks FKs at insert time (not deferred by default), so a child write (`chat_messages` etc.) referencing an `attempt_sessions.id` whose row doesn't exist yet would be **rejected**. Rather than make correctness depend on a mount-time POST winning a race — or weaken integrity by dropping the FK — the parent row is created **on demand, idempotently, by whatever writes the first child row**:

```sql
insert into public.attempt_sessions (id, submission_id, question_id, attempt_number)
values ($sessionId, $submissionId, $questionId, $attemptNumber)
on conflict (id) do nothing;
```

- Wrap this in a shared helper **`ensureAttemptSession(client, { id, submissionId, questionId, attemptNumber })`**. Call it (and `await` it) immediately **before** each FK-bearing child write, in the same request — so by the time Postgres checks the child's FK the parent is already committed and visible (supabase-js autocommits each statement). The race is then structurally impossible.
- `on conflict (id) do nothing` makes it idempotent: the mount POST, the `turn` route, the `utterance` route, and the `session-chunk` route can all "create" the same session — first writer wins, the rest no-op. No coordination needed.
- Call sites: the ~4 child-writing paths — `evaluate/route.ts` (transcript/static_activity), `turn/route.ts` (chat_messages), `multimodal/audio/utterance/route.ts`, `multimodal/audio/session-chunk/route.ts` (voice_messages) — plus the mount endpoint below reuses the same helper. Every one of these already threads `submissionId` + `attemptNumber` (both non-null on `attempt_sessions`) and `questionId`, so the helper always has what it needs. Prefer colocating the call inside the existing write helpers (`insertChatMessage`, and the transcript/static/voice inserts) so no route can forget it.
- *(A `BEFORE INSERT` trigger on the four child tables that auto-creates the missing session row is a valid alternative — one central DB place — but it's hidden magic and needs the child row to carry `submission_id`/`attempt_number`; the explicit app-layer helper matches this plan's style and is preferred.)*

### Client (`MultimodalInputArea.tsx`)

- Mint `sessionId` once via a ref/memo initializer keyed to mount (`React.useRef(() => crypto.randomUUID())` or equivalent) — a page refresh is a fresh mount, so this naturally produces a new id with zero persistence logic, exactly the desired "refresh = new session" behavior.
- On mount, fire-and-forget a POST to a new small endpoint (`src/app/api/multimodal/attempt-session/route.ts`) with `{ sessionId, submissionId, questionId, attemptNumber }` to create the `attempt_sessions` row. This POST is **no longer load-bearing for correctness** — it exists only to stamp `started_at` at true page-load time. FK safety is guaranteed independently by the `ensureAttemptSession` upsert that every child-writing route runs (see "FK safety" above): if this mount POST is slow or fails, the first child-writing route creates the row instead (`started_at` ≈ first interaction, a few seconds later — acceptable for foundation-only analytics). A failed session-create can therefore **never** block a chat/transcript write. Fire-and-forget is safe *because* of the on-demand upsert, not in spite of the FK. (The endpoint itself just calls `ensureAttemptSession`.)
- Thread `sessionId` into every request body that already carries `questionId`/`attemptNumber` (transcribe, tts, turn, transliterate, action-retry) — rides along on the exact same pattern already described above for `questionId`, no separate route-by-route description needed.

### Server (each AI-calling route)

Same three-part pattern as `questionId`: request body gains `sessionId: string`, destructure, thread into `AiCallContext`/`StartAiInvocationInput` and into `insertChatMessage`/voice_messages/etc. insert payloads alongside `questionId`.

### `AiCallContext` / logging types

- `src/lib/ai/gateway/model.ts` — `AiCallContext` gains `sessionId?: string | null`.
- `src/lib/ai/logging/types.ts` — `AiInvocationDomainContext` gains the same field.
- `src/lib/ai/logging/recordInvocation.ts` — `persistAiInvocationStart`'s insert gains `session_id: input.sessionId ?? null`.

### Verification addition

- `select count(*) from attempt_sessions;` after a full manual click-through (§ existing verification plan) — confirm one row per page load, not per message (idempotent `ensureAttemptSession` upsert must not create duplicates when the mount POST and the first child-writing route both run).
- Refresh mid-conversation during the manual click-through, confirm a second `attempt_sessions` row appears for the same `(submission_id, question_id, attempt_number)`, and that `chat_messages` written after the refresh carry the new `session_id` while messages from before the refresh keep the old one.
- **FK-safety path**: confirm no orphaned `session_id` FK violations ever occur, and specifically that a child write is never rejected. `select count(*) from chat_messages c where c.session_id is not null and not exists (select 1 from attempt_sessions s where s.id = c.session_id);` → expect `0`. To exercise the race deliberately, block/delay the mount POST (or point it at a failing URL) and confirm the conversation still writes rows correctly (the first `turn`/`utterance` call's `ensureAttemptSession` creates the parent).

## Critical files

- `supabase/migrations/20260714020000_question_stable_ids.sql` (new)
- `src/types/assignment.ts`, `src/types/submission.ts`
- `src/lib/ai/gateway/model.ts`, `src/lib/ai/gateway/structured.ts`, `src/lib/ai/logging/types.ts`, `src/lib/ai/logging/recordInvocation.ts`
- `src/components/Teacher/Assignments/AssignmentForm.tsx`, `src/components/Teacher/Assignments/QuestionCard.tsx`
- `src/lib/promptInterpolation.ts`
- `src/app/api/generate-dynamic-questions/route.ts`
- `src/app/api/evaluate/route.ts` (flagship — most changes)
- `src/app/api/multimodal/turn/route.ts` and siblings (`generate-rubric-and-answer`, `action-retry`, `tts`, `transcribe`, `transliterate`)
- `src/lib/multimodal/actions/dispatcher.ts`, `src/lib/ai/gateway/speech.ts` (lib-layer AI threading helpers)
- `src/lib/submissions/grading.ts`, `src/lib/queries/submissions.ts`, `src/lib/queries/chatMessages.ts`, `src/lib/queries/voiceMessages.ts`
- `src/hooks/swr/useSubmissions.ts` (SWR hooks + cache keys)
- `src/app/api/submissions/review-question/route.ts`, `src/app/api/submissions/select-attempt/route.ts`, `src/app/api/submissions/release/route.ts`, `src/app/api/multimodal/conversation/reset/route.ts`
- `src/components/Shared/AssessmentShell.tsx`, `src/components/Shared/AssessmentInputs/MultimodalInputArea.tsx`, `src/components/Shared/AssessmentInputs/StaticTextInputArea.tsx` (localStorage draft key + tracking id), `src/components/Shared/AssignmentResponseCore.tsx`
- `src/components/Teacher/Assignments/SubmissionGradingPanel.tsx`, `src/components/Teacher/Assignments/SubmissionContentPanel.tsx` (teacher grading/review UI — flagship bug surface)
- `src/components/Student/StudentAssignmentResponse.tsx`, `src/components/Public/PublicAssignmentResponse.tsx`, `src/components/Teacher/Assignments/AssignmentPreviewResponse.tsx` (transcript-answer reconstruction)
- `src/app/api/multimodal/attempt-session/route.ts` (new — creates `attempt_sessions` rows)
