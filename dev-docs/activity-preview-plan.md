# Implementation Plan — Activity Preview ("Save and Preview")

> **For the implementing agent.** This is an execution plan, not just a design. Work **one phase at a
> time, top to bottom**. After each phase run its **Verify** block; don't start the next phase until it
> is green. If reality diverges from a cited `file:line` (the repo moves), re-locate by symbol name with
> Grep and trust the code over this doc. Ask before inventing product behaviour not specified here.

---

## 1. Goal

While a teacher is building or editing an activity, they have **no way to experience it as a student
would**. We add a **"Save and Preview"** action to the assignment form's floating footer that **saves the
current configuration and immediately opens the real student-taking flow** driven by that saved config —
across every assessment mode (voice / text chat / static text / multimodal) and activity type
(learning / assessment / speaking practice).

The preview runs the **real pipeline** (real evaluation, real TTS/STT, real feedback) so it is a true
rehearsal — **it writes rows to the DB** (a submission, transcripts, attempts, evaluations, voice/chat
messages, files). **None of that preview data may surface anywhere submissions are listed or counted** —
not in the teacher submissions view, not in public submissions, not in pending-approval badges, not in
analytics, not in student-facing completion. Preview is *for the teacher's eyes only*.

### Chosen approach (Option A — settled)

Preview runs against the **real saved assignment row** (no clone). "Save and Preview" persists the current
form state (create → draft; edit → update **preserving status**), then opens the student flow against that
row using a **flagged preview submission** that every submission read filters out.

We considered a hidden "preview-clone" assignment (Option B) that would let a teacher preview *unsaved*
edits to a live activity without touching it. **Rejected:** ~2× the code, a fragile "filter the flag on
every assignment read" constraint, a clone-vs-real-save divergence risk (the preview could lie), and
create-mode keying/cleanup complexity. Option A is simpler and **faithful by construction** — you preview
the literal row you saved. Its only cost is the live-activity case below, which we handle explicitly.

---

## 2. Why this still needs real DB rows (the core constraint)

The student-taking pipeline is **DB-resolved, not prop-driven**. Even though the student UI
(`AssignmentResponseCore.tsx:71`) receives an `assignmentData` object and a `submissionId`, the heavy
lifting is server-side:

- **Evaluation** (`/api/evaluate`), **multimodal turn** (`/api/multimodal/*`), **dynamic question
  generation** (`/api/generate-dynamic-questions`), and **file content** (`/api/files/*`) all **re-load
  the assignment from the DB by `assignment_id`** and **write attempts/evaluations keyed to a real
  `submission_id`** (FK into `submissions`). Rollups land on `submissions` via DB triggers.

So preview cannot be purely in-memory — it needs (a) a resolvable assignment row (Option A reuses the real
one) and (b) a real submission row. The only thing we must add is a way to mark that submission as
**preview** and hide it everywhere.

### 2.1 Current footer & save flow (what exists today)

`AssignmentFormFooter.tsx:39` renders `Cancel · Save as Draft · Create/Update`. The primary button is a
native `type="submit"` firing `handleSubmit` with `draft=false`; **Save as Draft** calls
`onSaveDraft → handleSubmit(e, true)` (`AssignmentForm.tsx:1201`). `handleSubmit` (`AssignmentForm.tsx:717`)
runs full client-side validation, then calls `onSubmit(...)` with the entire config payload
(`AssignmentForm.tsx:806`). In **create** mode `onSubmit` is `createAssignment` + `createContentItem`
(`create/page.tsx:139`) and then **navigates away** (`router.push`, `create/page.tsx:858` area); in **edit**
mode it's `updateAssignment` (`edit/page.tsx`). The form's status is decided by `data.isDraft`
(`create/page.tsx:151`: `status: data.isDraft ? "draft" : "active"`).

**Key wiring consequence:** "Save and Preview" must save **without navigating away** (so the builder state
survives) and, in edit mode, **without changing status** (a live activity stays active; a draft stays
draft). The existing `handleSubmit` navigates on create and forces a draft boolean — so Preview needs its
own save path, not a reuse of `handleSubmit` verbatim.

### 2.2 Where a preview submission would otherwise leak

A preview submission is created against the **real** `assignment_id`, so it shares that id with real
student submissions. It must be filtered out of:

- **Teacher class view** — `getSubmissionsByAssignmentWithStudents` (`submissions.ts:813`) maps over
  *class students* by `student_id`. The teacher isn't a class student, so it *probably* won't show — **do
  not rely on that**; filter explicitly.
- **Public submissions** — `getPublicSubmissionsByAssignment` (`submissions.ts:900`) selects
  `student_id IS NULL`.
- **Pending-approval badges** — `getStudentIdsWithPendingApprovalsInClass` (`submissions.ts:38`).
- **Any per-assignment aggregate** — analytics under `Teacher/Classes/analytics/*` and any rollup reader
  that counts submissions for an assignment **regardless of student** WILL include preview runs unless
  filtered. This is the real leak; the flag is mandatory.
- **Content completion / activity tracking** — preview must never mark the content item complete.

---

## 3. Settled behaviour (implement to these; don't re-litigate)

- **Action label: "Save and Preview."** Footer order: `Cancel · Save as Draft · Save and Preview ·
  Create/Update` (primary submit stays last). Disabled while `loading`.
- **Save semantics:**
  - **Create mode:** create the activity as a **draft** (+ content item), **do not navigate away**, then
    open preview against it. Remember the created `assignment_id` in form state so repeat previews
    **update** the same draft (no duplicates).
  - **Edit mode:** **update in place, preserving current status** (active stays active, draft stays draft).
- **Live-activity confirmation:** when the activity being edited is **active** (visible to students),
  clicking Save and Preview first shows a confirm dialog — *"This will save your changes. This activity is
  live, so students will see them now."* Proceed only on confirm. (Drafts save silently.)
- **Faithful preview:** preview shows exactly what a student would see, including **tentative feedback**
  when `feedback_requires_approval` is on. Not a bug — document it in the preview banner.
- **Integrity off in preview:** no tab-leave tracking, no input-violation lock, copy/paste allowed.
- **No completion / relaxed attempts:** `contentItemId = null`; `max_attempts` not enforced in preview;
  an explicit **"Restart preview"** resets it.
- **One preview submission per (teacher, assignment):** resume on re-preview; "Restart preview" stales it.

---

## 4. Target data model

A single marker, default-false so existing rows are unaffected.

```sql
ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS is_preview boolean NOT NULL DEFAULT false;
```

- `is_preview = true` → exclude from every submission read (§6.2).
- **No assignment changes** — preview reuses the real assignment row.
- **No new RLS** — `submissions` already has permissive `Allow public to create/read/update submissions …
  (true)` policies (`20260526165126_remote_schema.sql:3946/3970/3986`), so the teacher can create one.

**Types:**
- `src/types/submission.ts` (`Submission`): add `is_preview?: boolean;`.
- Add `is_preview` to the column constant lists in `submissions.ts` (`SUBMISSION_ALL_COLUMNS:15`,
  `SUBMISSION_LIST_COLUMNS:768`, `SUBMISSION_SESSION_RESTORE_COLUMNS:19`).

---

## 5. Repo conventions to honour

- **Migrations** live in `supabase/migrations/` named `YYYYMMDDHHMMSS_description.sql`; make them
  idempotent (`ADD COLUMN IF NOT EXISTS`).
- **Query layer**: all DB access goes through `src/lib/queries/*` with `createClient()` from
  `@/lib/supabase`. Don't query Supabase from components.
- **Verify commands** (repo root): Typecheck `npx tsc --noEmit` · Lint `npm run lint` · Build `npm run build`.
- The student flow is wrapped per-context: `StudentAssignmentResponse.tsx` (authed),
  `PublicAssignmentResponse.tsx` (anon), both rendering the shared `AssignmentResponseCore`. The preview
  wrapper is a **third sibling** — do not fork the core.

---

## 6. Phased plan

Dependency order: DB/flag → read filtering → preview submission lifecycle → preview UI wrapper → save path
+ footer wiring → mode smoke-tests.

### Phase 1 — Migration & types

1. New migration adding `submissions.is_preview` (§4, idempotent).
2. Add `is_preview?: boolean` to the `Submission` type and to the three column-constant lists.
3. No behaviour change yet; existing flows keep writing `is_preview=false`.

**Verify:** `npx tsc --noEmit`; apply migration; confirm column exists; existing create/edit/save still work.

### Phase 2 — Exclude preview submissions from every read

Do this **before** writing any preview data, so it can't leak mid-build.

1. Add `.eq("is_preview", false)` (or `.or("is_preview.is.null,is_preview.eq.false")` for legacy-null
   safety) to: `getSubmissionsByAssignmentWithStudents:813`, `getPublicSubmissionsByAssignment:900`,
   `getStudentIdsWithPendingApprovalsInClass:51`.
2. Grep every other `.from("submissions").select` caller (analytics in `Teacher/Classes/analytics/*`, any
   rollup/aggregate reader) and filter them too.
3. Confirm content-completion (`contentCompletions.ts`, `useIsContentComplete`) cannot be driven by a
   preview submission (it won't be, because preview passes `contentItemId=null` — see Phase 4).

**Verify:** Manually insert a `submissions` row with `is_preview=true`; confirm it appears in **no**
teacher/public/analytics surface. `npm run lint`.

### Phase 3 — Preview submission lifecycle

In `src/lib/queries/submissions.ts`:

1. Extend `createSubmission` (`:180`) with an `isPreview?: boolean` option that sets the column (carries
   the teacher's `student_id`), **or** add a thin `createPreviewSubmission(assignmentId, lang, mode,
   teacherId)`.
2. Add `getPreviewSubmission(teacherId, assignmentId)` (resume) and `resetPreviewSubmission` (restart) —
   the latter reuses the existing `markAttemptsAsStale` (`:700`).
3. Guard: a preview submission stays `is_preview=true` and never participates in release/completion that
   could leak (it's filtered out of all reads regardless).

**Verify:** Create a preview submission against a real draft; confirm it's invisible in all surfaces and
that restart stales attempts. `npm run lint`.

### Phase 4 — Preview UI wrapper + `previewMode` in the core

1. Thread a new `previewMode?: boolean` prop through `AssignmentResponseCore` (`:71`) that:
   - disables `useTabLeaveTracking` (`:410`) — no integrity tracking/locking,
   - forces `allowCopyPaste = true` (overrides `getEffectiveAllowCopyPaste`, `:376`),
   - relaxes/ignores `max_attempts` gating in `AssessmentShell` (`:585`).
2. Add `src/components/Teacher/Assignments/AssignmentPreviewResponse.tsx` (sibling of
   `StudentAssignmentResponse.tsx`):
   - Props: `assignment: Assignment`, `teacherId`, `onExit`.
   - Resolves/creates the preview submission (Phase 3), then renders `AssignmentResponseCore` with
     `previewMode`, `contentItemId={null}`, `forceComplete={false}`.
   - Wrap in a clearly-badged container: a **"PREVIEW"** banner (+ the tentative-feedback note from §3),
     **"Restart preview"**, and **"Exit preview"** controls.
3. **Surface:** render as a **full-screen overlay/Dialog launched from the form** so the builder keeps its
   state and editing position (no navigation away, no remount). Pass `classDbId` so multimodal capability
   lookups resolve.

**Verify:** Manually mount the wrapper for a **static_text** activity; answer a question; evaluation runs,
feedback renders, **no** tab-switch lock, content stays incomplete, nothing in submissions. `npm run build`.

### Phase 5 — Save path + footer button

1. `AssignmentFormFooter.tsx`: add an `onSaveAndPreview?: (e) => void` prop and a **"Save and Preview"**
   outline button between Save-as-Draft and the primary (§3). Disable while `loading`.
2. `AssignmentForm.tsx`:
   - Factor the **validation** out of `handleSubmit` (`:717`) into a shared `validate()` so Save and
     Preview can't drift from Save.
   - Add `handleSaveAndPreview`: `validate()` → (if editing an **active** activity, show the live-activity
     confirm, §3) → **save without navigating** → open the preview overlay (Phase 4).
   - Saving needs a **non-navigating, status-preserving** callback. Add a new optional prop
     `onSaveForPreview?: (data) => Promise<{ assignmentId, assignmentRow }>` supplied by the create/edit
     pages, distinct from `onSubmit`:
     - **Create page:** `createAssignment` (status `draft`) + `createContentItem`, **return the new ids**,
       **no `router.push`**. Store the returned `assignment_id` in form state; subsequent previews call
       `updateAssignment` on it instead of creating again.
     - **Edit page:** `updateAssignment` **preserving the existing status** (don't pass a forced draft
       flag), return the updated row.
   - Track `previewOpen` + the saved `assignment` in form state; render `AssignmentPreviewResponse` when open.
3. Surface validation/save errors inline via the footer `error` slot (`AssignmentFormFooter.tsx:49`).

**Verify:** From a valid **create** form → Save and Preview creates one draft (+ content item), opens
preview, **stays on the builder**; edit a question, Save and Preview again → same draft updated (no
duplicate). In **edit** mode on an **active** activity → confirm dialog appears, status stays `active`
after save. `npm run lint`.

### Phase 6 — Mode smoke-tests

Each mode resolves the (now real, saved) assignment by id and writes to the preview submission:

- **Multimodal**: `/api/multimodal/turn`, `…/tts`, `…/transcribe`, conversation reset — confirm gating
  reads the saved `bot_prompt_config` + class capabilities.
- **Dynamic questions** (`dynamic_questions_enabled`): the file-upload step
  (`AssignmentResponseCore.tsx:538`) + `/api/generate-dynamic-questions` persist generated questions to the
  **preview** submission only.
- **File submission**: `/api/files/*` uploads attach to the preview submission (teacher passes existing
  `Users can insert files for their submissions` RLS).

**Verify:** One preview end-to-end in **multimodal** and one in a **dynamic-questions** activity; confirm
no preview rows leak into any submissions surface.

---

## 7. Conditions / edge-case matrix

| Condition | Behaviour |
|---|---|
| Form invalid on Save and Preview | Block with the same validation as save; inline error. |
| Create mode (no saved activity) | Create draft (+ content item) without navigating; reuse its id on re-preview. |
| Editing a **draft** | Update the draft silently; preview it. |
| Editing an **active/live** activity | Confirm dialog (changes go live); save preserving `active` status; preview. |
| Assessment mode voice/chat/static/multimodal | All work (real saved row); smoke-test each (Phase 6). |
| `dynamic_questions_enabled` / file submission | Upload + generation run against the preview submission. |
| `feedback_requires_approval` on | Preview shows tentative feedback, as a student would (§3). |
| Integrity (tab switch / copy-paste) | Disabled in preview. |
| `max_attempts` reached | Not enforced in preview; "Restart preview" resets. |
| Content completion | Never marked complete (`contentItemId=null`). |
| Teacher / public / pending / analytics surfaces | Preview submissions filtered out everywhere (Phase 2). |
| Re-preview after edits | Same row updated, same preview submission resumed — no duplicates. |
| Abandoned create-mode preview | Leaves a real **draft** activity in the class content (known A trade-off — see §8). |

---

## 8. Known trade-offs of Option A (accepted)

- **Create-mode preview commits the activity into existence** — the first Save and Preview persists a real
  **draft** activity and a content-feed item. If the teacher abandons it, that draft remains in their
  content list (it's a draft, so not student-visible, and can be deleted normally). This is the price of
  reusing the real row instead of a throwaway clone.
- **Live edits go live on preview** — by design, mitigated by the confirmation dialog (§3). A teacher who
  wants to preview *without* affecting live students should duplicate the activity or work on a draft.
- **Preview = save** — there is no "look without saving"; the button name ("Save and Preview") makes this
  explicit.

---

## 9. Files to touch (index)

- **DB**: new `supabase/migrations/<ts>_submissions_is_preview.sql`.
- **Types**: `src/types/submission.ts`.
- **Queries**: `src/lib/queries/submissions.ts` (column lists, read filters, preview submission helpers).
- **Student flow**: `src/components/Shared/AssignmentResponseCore.tsx` (`previewMode` → integrity +
  copy-paste + attempts), new `src/components/Teacher/Assignments/AssignmentPreviewResponse.tsx`.
- **Form**: `src/components/Teacher/Assignments/AssignmentForm.tsx` (shared `validate()`,
  `handleSaveAndPreview`, non-navigating save, saved-id state, preview overlay),
  `src/components/Teacher/Assignments/AssignmentFormFooter.tsx` (Save and Preview button).
- **Pages**: `app/teacher/classes/[classId]/assignments/create/page.tsx` and `…/[assignmentId]/edit/page.tsx`
  (add the non-navigating, status-preserving `onSaveForPreview`).
- **Analytics**: any `src/components/Teacher/Classes/analytics/*` reading `submissions` directly.

---

## 10. Settled decisions

- **Option A** (preview the real saved row), **not** a preview-clone — faithful by construction, ~half the code.
- **Single marker** `submissions.is_preview` is the source of truth for "preview data"; **every** submission
  read filters it.
- **"Save and Preview"**: create → draft (no nav); edit → update **preserving status**; **live activity →
  confirm first**.
- **Integrity off, completion off, attempts relaxed, tentative feedback shown as-is** in preview.
