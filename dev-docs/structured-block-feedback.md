# Structured Block-Based AI Feedback

## Context

Today, the feedback a student receives after finishing an assignment is **plain
text**: a single `overall_feedback` string plus a `rubric_scores[]` array, both
rendered as `whitespace-pre-wrap` text in `AttemptFeedbackView.tsx`. The shared
evaluation footer even instructs the model to emit *plain text only, no markdown*.

We want feedback to be **dynamically structured into sections** rather than a flat
blob. Markdown was considered but rejected: a teacher editing markdown can break the
syntax and corrupt the whole rendered layout. Instead we want a **constrained block
document** — the AI composes feedback from a small whitelist of presentation
primitives, and sections/titles are fully dynamic (driven by activity type + teacher
goals). Teachers get full control over the document (edit text, add/remove/reorder
blocks), but always through typed controls — never raw JSON or markup. This makes
rendering un-breakable: there is no parser, so the structure is valid by construction
and a bad teacher text edit can at worst show literal characters, never break layout.

This mirrors the existing **multimodal action registry** pattern
(`src/lib/multimodal/actions/registry.ts` + `ActionCard.tsx`): a discriminated
union of typed blocks, each with a schema + renderer, switched on `kind`.

### Decisions (confirmed with user)
- **Blocks are presentation primitives, NOT semantic kinds.** We do not enumerate
  "language feedback" / "concept feedback" etc. Those are dynamic `section` titles
  the AI generates. The fixed whitelist is layout-only.
- **v1 primitives:** `section`, `paragraph`, `list`, `callout`, `evidence`, `rubric`.
- **A section holds an ordered, mixed array of leaf primitives** (`children`) — e.g.
  paragraph + evidence + callout + list in one section. 2-level model (section →
  leaves), no deep recursion, to keep the AI schema simple.
- **Rubric stays.** Per-item points remain the grading backbone (drive `score`);
  the rubric renders as a `rubric` block inside the document.
- **Teacher goals** are expressed via a new free-text **"Feedback focus"** field per
  activity, fed into the evaluation prompt to steer which sections the AI produces.
- **Teachers have full structural control** — edit text in blocks AND add, remove,
  and reorder blocks (and add/remove `list` items). Structure stays valid because
  edits go through typed controls (pick a block type to add, drag/move to reorder),
  never raw JSON or markup — so rendering still can't break.
- **Generation is validated and self-healing** — the AI's `feedback_doc` is checked
  against the Zod schema; if it's structurally invalid it is regenerated (bounded
  retries) before persisting, so a malformed document never reaches storage/UI.
- **Backward compatible:** existing attempts with only plain-text `feedback` keep
  rendering as today (fallback path).

## Data model

### Block document type (new)
`src/types/feedbackDoc.ts` (new) — the discriminated union + document wrapper:

```ts
type FeedbackLeaf =
  | { kind: "paragraph"; text: string }
  | { kind: "list"; ordered?: boolean; items: string[] }
  | { kind: "callout"; tone?: "tip" | "warning" | "info"; text: string }
  | { kind: "evidence"; quote: string; comment: string };

type FeedbackBlock =
  | { kind: "section"; title: string; children: FeedbackLeaf[] }
  | { kind: "rubric" }   // marker; scores come from rubric_scores (single source of truth)
  | FeedbackLeaf;        // leaves also allowed at top level

interface FeedbackDoc { version: 1; blocks: FeedbackBlock[]; }
```

Note: the `rubric` block is a **marker only** — it renders from the existing
`rubric_scores` data so scores aren't duplicated/desynced. The AI just decides
*where* in the document the rubric appears.

### Storage
Add a nullable `feedback_doc jsonb` column to `submission_attempts` (new migration
`supabase/migrations/2026XXXXXXXXXX_feedback_doc.sql`, following the existing
migration naming). Keep `feedback` (text) and `rubric_scores` (jsonb) as-is:
- `rubric_scores` = grading source of truth (unchanged).
- `feedback` (text) = flattened plain-text rendering of the doc, kept populated for
  backward compat, search, and the legacy fallback render.
- `feedback_doc` = the structured document (null for old/legacy attempts).

Mirror onto `attempt_ai_evaluations` with `ai_feedback_doc jsonb` for the audit copy
(parallels existing `ai_feedback` / `ai_rubric_scores`).

### Teacher config
Add `feedbackFocus?: string` to the activity/assignment config. Cleanest home is
alongside the existing per-activity prompt config (`bot_prompt_config` /
`custom_evaluation_prompt` path). Surface it as a textarea in the teacher activity
editor near the rubric/evaluation-prompt settings.

## Generation

### Schema (`src/lib/ai/schemas/evaluation.ts`)
Extend the AI output schema. Keep `rubric_scores` exactly as-is (grading). Replace
the single `overall_feedback` string with a structured `feedback_doc` matching the
union above. Because this file uses raw `jsonSchema(...)`, encode the union as the
JSON-Schema for `FeedbackDoc` (an `anyOf`/discriminated `kind` array). Keep
`overall_feedback` too (or derive it) for the flattened text fallback — simplest is
to keep emitting it and also emit `feedback_doc`.

### Evaluator (`src/lib/ai/evaluateSubmission.ts`)
- Inject the teacher's **Feedback focus** text + the section guidance into the user
  prompt (it already assembles rubric text + answer + language instructions).
- Update the **shared footer** in the activity registry
  (`buildEvaluationSystemMessage` / `EVALUATION_SYSTEM_SHARED_FOOTER`): replace the
  "plain text only, no markdown" instruction with block-document guidance —
  *"organize feedback into titled sections using the provided block types; each text
  field is plain text; do not use markdown."* List the available primitives and the
  rule that section titles should reflect the teacher's focus areas.
- **Validate the returned `feedback_doc` against the Zod schema; if invalid,
  regenerate** (bounded retries, reusing the existing `generateStructured` retry
  path / `DEFAULT_MAX_ATTEMPTS` in `src/lib/ai/structured.ts`). On a retry, append a
  short corrective note to the prompt naming the structural violation. Only after all
  retries fail do we fall back to wrapping `overall_feedback` in a single `paragraph`
  block — so storage/UI never see a malformed doc.
- Flatten the doc to plain text → store in `feedback` (text) for fallback/search.
- Persist `feedback_doc` to `submission_attempts` and `ai_feedback_doc` to
  `attempt_ai_evaluations`.

### Per-activity prompts (`src/lib/activityTypes/*.ts`)
The `evaluationPrompt` templates currently end with "write overall feedback…".
Update wording to "compose the feedback document…" and let each activity type's
existing persona continue to shape tone. `speaking_practice` and `code_review`
benefit most from the `evidence` block (cite transcript moments) — mention it in
their guidance.

## Rendering

### New renderer components (modular — `ui/` primitive + feature composer)
Per the user's modular-component preference, build small primitives, not one inlined
blob:
- `src/components/Shared/FeedbackDoc/FeedbackDocView.tsx` — top-level: maps over
  `doc.blocks`, wraps in an error boundary that falls back to legacy plain-text
  `feedback`.
- `src/components/Shared/FeedbackDoc/FeedbackBlock.tsx` — `switch (block.kind)`
  exactly like `ActionCard.tsx`; `default: return null` for unknown kinds
  (forward-compatible).
- One small component per primitive under `FeedbackDoc/blocks/`: `SectionBlock`,
  `ParagraphBlock`, `ListBlock`, `CalloutBlock`, `EvidenceBlock`. The `rubric` case
  reuses the existing rubric breakdown from `AttemptFeedbackView`.

### Wire into existing view (`AttemptFeedbackView.tsx`)
This is the single shared feedback view used by both student
(`QuestionCompletionPanel`) and teacher rows. Change its body to:
- If `feedbackDoc` present → render `<FeedbackDocView doc={...} rubricScores={...} />`.
- Else → keep current plain-text + rubric breakdown (legacy path, unchanged).

Add a `feedbackDoc?: FeedbackDoc | null` prop; thread it through callers
(`QuestionCompletionPanel.tsx`, teacher grading panel). Score summary + tentative
banner behavior unchanged.

## Teacher editing (full structural control)

Extend `EditableAttemptGradingForm.tsx` (and its `AttemptGradeEdit` type) to carry
`feedback_doc`. The rubric section + scoring inputs stay exactly as they are (scores
still drive `score`). For the narrative, instead of the single "Overall Feedback"
textarea:
- New `src/components/Teacher/Assignments/FeedbackDocEditor.tsx` walks the doc tree
  and renders a labeled input per editable text field:
  - `section.title` → small `<Input>` (label "Section title")
  - `paragraph.text`, `callout.text` → `<Textarea>`
  - `list.items[]` → one `<Input>` per item, each with a remove (×) button + an
    **"Add item"** button at the end of the list
  - `evidence.quote` / `evidence.comment` → two `<Textarea>`s
  - `callout.tone` → small `<Select>` (tip/warning/info)
  - `rubric` marker → renders nothing extra (rubric edited in the rubric section above)
- **Structural controls (typed, not raw):**
  - **Add block:** an "Add block" control (menu/`<Select>` of the whitelisted kinds)
    inserts a new empty, schema-valid block at a chosen position. For a `section`,
    children can likewise be added from the leaf kinds.
  - **Remove block:** a delete (×) control per block / per child.
  - **Reorder:** move up/down buttons (and/or drag handles) on each block and each
    child within a section.
  - Adding only ever inserts well-formed blocks and reordering only permutes the
    array, so the document is **structurally valid by construction** — teachers pick
    types and positions, never write JSON/markup.
- Edits update the doc immutably. On save, **validate against the Zod schema** and
  re-flatten into the plain-text `feedback` field so the fallback stays in sync.
- Keep `CompareToAI` working; optionally show the original AI doc instead of
  `ai_feedback` text.

## Files

**New**
- `src/types/feedbackDoc.ts` — union types + Zod schema + `flattenFeedbackDoc()` helper.
- `src/components/Shared/FeedbackDoc/FeedbackDocView.tsx` + `FeedbackBlock.tsx` +
  `blocks/*`.
- `src/components/Teacher/Assignments/FeedbackDocEditor.tsx`.
- `supabase/migrations/2026XXXXXXXXXX_feedback_doc.sql` — add `feedback_doc`,
  `ai_feedback_doc` columns.

**Modified**
- `src/lib/ai/schemas/evaluation.ts` — add `feedback_doc` to output schema.
- `src/lib/ai/evaluateSubmission.ts` — prompt focus, validation/fallback, persistence.
- `src/lib/activityTypes/registry.ts` (shared footer) + `learning.ts` /
  `assessment.ts` / `speaking_practice.ts` / `code-review.ts` (prompt wording,
  evidence guidance).
- `src/lib/activityTypes/types.ts` + config types — add `feedbackFocus`.
- `src/components/Shared/AttemptFeedbackView.tsx` — render doc when present.
- `src/components/Shared/QuestionCompletionPanel.tsx` — pass `feedbackDoc`.
- `src/components/Teacher/Assignments/EditableAttemptGradingForm.tsx` +
  `SubmissionGradingPanel.tsx` — carry/edit/persist `feedback_doc`.
- Teacher activity editor — add the "Feedback focus" textarea.
- `src/types/submission.ts` / `src/lib/queries/submissions.ts` — include
  `feedback_doc` in attempt types/queries.

## Verification

1. **Migration:** apply locally; confirm `feedback_doc` / `ai_feedback_doc` exist and
   are nullable.
2. **Generation:** set a "Feedback focus" (e.g. "language use and concept
   understanding") on a test activity, submit as a student, hit `/api/evaluate`.
   Confirm the stored `feedback_doc` has dynamic `section` titles reflecting the
   focus, mixed leaf blocks, and that `rubric_scores`/`score` are unchanged.
3. **Student render:** open the completion panel → feedback shows as structured
   sections (not one blob); rubric block shows scores.
4. **Legacy fallback:** load an old attempt (no `feedback_doc`) → still renders the
   plain-text feedback. Force a malformed doc → error boundary falls back, no crash.
5. **Robustness:** in the teacher editor, paste markdown/HTML/`*`/`{}` into a field,
   save, view as student → renders as literal text, layout intact (the core goal).
6. **Teacher edit:** edit a section's paragraph, add + remove a list item, add a new
   `callout` block, reorder two sections, delete a block; save draft, release →
   student sees the edited structure; `feedback` (flattened text) stays in sync.
7. **Generation guard:** force/simulate a malformed doc from the model → confirm it
   regenerates, and after exhausting retries falls back to a single-paragraph doc
   rather than persisting invalid structure.
8. `npm run lint` / typecheck pass.

## Out of scope (future, via same registry)
- Standalone score/progress badge primitive; per-block teacher toggles; streaming the
  doc during generation; nested sections.
