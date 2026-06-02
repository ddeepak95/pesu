# Adding a new activity type

This guide explains how to add a new **activity type** — the pedagogical shape of
an assignment (a learning activity, an assessment, a speaking-practice scenario,
…). An activity type drives the default AI prompts, the evaluation prompt, the
Question Card UI labels, and the config that is preselected when a teacher picks
it. `speaking_practice` is the reference implementation; every step below points
at real code you can copy.

> Related: actions are a separate extensible system — see
> [`adding-multimodal-actions.md`](./adding-multimodal-actions.md).

---

## Mental model

The **activity-type registry**
(`src/lib/activityTypes/registry.ts`) is the single source of truth. It is
**pure / client-safe** (no server-only imports), so the same module is read by:

| Consumer | What it reads |
|---|---|
| `src/lib/promptTemplates.ts` | `persona`, `taskInstructions`, `conversationStart`, `evaluationPrompt` → default bot prompt + evaluation prompt |
| `AssignmentForm.tsx` | `label` (dropdown), `defaults` (preselection on change) |
| `QuestionCard.tsx` (editor) | `labels` (Question → Scenario, Rubric → …) |
| `Shared/QuestionView.tsx` (read-only preview) | `labels` — same relabeling in the assignment-detail / content-tab preview |
| `api/generate-rubric-and-answer/route.ts` | `generation` copy for the rubric/expected-answer generator |
| `chat-stream-object.ts` (server) | `buildMultimodalDirective`, `buildLanguageSupportActiveDirective` |

Once you add a registry entry, the dropdown, labels, prompts, and directives all
pick it up — there is nothing else hardcoded per type.

---

## Step-by-step

We'll use the shipped `speaking_practice` type as the example.

### 1. Kind — `src/lib/activityTypes/types.ts`

Add the literal to the union:

```ts
export type ActivityTypeKind = "learning" | "assessment" | "speaking_practice";
```

`ActivityType` in `promptTemplates.ts` re-exports this, so existing call sites are
unaffected. The persisted column type also widens —
`Assignment.activity_type` in `src/types/assignment.ts`.

### 2. Type definition file — `src/lib/activityTypes/<kind>.ts`

Create a new file for the activity type (e.g. `speaking_practice.ts`).
Define your prompt constants and export a single `ActivityTypeDefinition`.
Required fields: `label`, `persona`, `taskInstructions`, `conversationStart`,
`evaluationPrompt`, `evaluationSystemPersona`, `labels`.
Prompt strings use the same `{{variable}}` / `{{#if variable}}…{{/if}}`
interpolation as the other types (see `promptInterpolation.ts`).

Then import and register it in `src/lib/activityTypes/registry.ts`:

```ts
import { SPEAKING_PRACTICE_DEFINITION } from "./speaking_practice";

export const ACTIVITY_TYPE_REGISTRY = {
  // …existing types…
  speaking_practice: SPEAKING_PRACTICE_DEFINITION,
};
```

```ts
speaking_practice: {
  kind: "speaking_practice",
  label: "Speaking Practice",                 // dropdown label
  persona: SPEAKING_PERSONA,                  // {{language}}, {{title}}, {{#if instructions}}…
  taskInstructions: SPEAKING_TASK,            // reinterprets {{rubric}} as "aspects to cover"
  conversationStart: { first_question: "…", subsequent_questions: "…" },
  evaluationPrompt: SPEAKING_EVALUATION,       // {{language}} base + {{#if support_language}} override (see step 4)
  evaluationSystemPersona: SPEAKING_EVALUATION_SYSTEM_PERSONA, // LLM system message persona (plain text)
  labels: {                                   // UI overrides; omit a key to keep the default
    question: "Scenario",
    rubric: "Aspects to cover",
    expectedAnswer: "Conversation guidance & expected responses",
    // questionPlaceholder, rubricItemPlaceholder, rubricItemNoun,
    // expectedAnswerPlaceholder, expectedAnswerHelp, questionNoun …
  },
  defaults: {                                 // preselected when the teacher picks this type
    interactionType: "multimodal",            // applied only if the class allows it
    multimodal: { languageSupportEnabled: true, availableActions: [] },
  },
  generation: {                               // optional: copy for the rubric/answer generator
    rubricCoverage: "the distinct aspects the learner must cover …",
    expectedAnswerCoverage: "for each aspect, how the tutor should guide …",
    guidance: "This is a SPEAKING-PRACTICE role-play scenario, not a written question. …",
  },
  buildMultimodalDirective: () => "SPEAKING PRACTICE: …",   // optional server directive
  buildLanguageSupportActiveDirective: ({ languageLabel }) => "…", // optional override
},
```

**`labels`** merge over `DEFAULT_ACTIVITY_TYPE_LABELS` via
`getActivityTypeLabels(kind)`. Leave `labels: {}` to keep all defaults
(learning/assessment do this).

**`defaults`** are applied in `AssignmentForm`'s `handleActivityTypeChange`:
`interactionType` switches the Interaction Type dropdown (only when the class's
allowed modes include it); `multimodal` merges into
`bot_prompt_config.multimodal_actions` (language support toggle + enabled
actions), which the existing teacher editors render immediately.

> The Supporting Content textbox has been removed from the editor; don't
> reference it in new types.

### 3. Optional server directives

Both are optional hooks read by `buildMultimodalDirectives` in
`chat-stream-object.ts`:

- **`buildMultimodalDirective()`** — an extra system-prompt line appended after
  the actions + end-conversation directives (e.g. "stay in character, let the
  student talk"). Return `null`/omit for none.
- **`buildLanguageSupportActiveDirective({ languageLabel, primaryLanguageLabel })`**
  — replaces the default literal-translation directive on a language-support
  turn (e.g. speaking practice *continues the role-play* in the support language
  instead of translating). Return `null`/omit to keep the default.

`activityType` reaches the server because the client
(`MultimodalInputArea.tsx`) sends it in the `/api/multimodal/turn` body and the
route threads it through `resolveMultimodalTurnCall`.

### 4. Optional: support language in prompts

There is a single `{{support_language}}` variable — the learner's selected/configured
support language name, or **empty string** when none. It's available in every prompt
(system, conversation start, evaluation) and resolves entirely client-side: the
learner's choice flows from `AssessmentShell.tsx` → `useInterpolatedPrompts`
(`supportLanguage` prop) → `buildRuntimeContext`/`interpolatePromptsForRuntime`.

Because it's empty when unset, gate any support-specific text with
`{{#if support_language}}…{{/if}}` so it disappears cleanly when no support language
is configured.

To write **feedback in the support language** (e.g. speaking practice, where the
learner is being taught a new language but wants feedback they understand) while
falling back to the primary language otherwise, keep the base instruction in
`{{language}}` and add an override block (the interpolation engine has `{{#if}}`
but no `else`):

```
IMPORTANT: All feedback text must be written in {{language}}.
{{#if support_language}}
LANGUAGE OVERRIDE: The learner had {{support_language}} available as a support language.
Write ALL feedback in {{support_language}} instead of {{language}}.
{{/if}}
```

`SPEAKING_EVALUATION` is the reference. No `/api/evaluate` change — the pre-rendered
prompt is sent as `custom_evaluation_prompt`.

### 5. Optional: rubric/expected-answer generator copy

The `generation` block customizes the "Generate Rubric & Expected Answer"
endpoint (`/api/generate-rubric-and-answer`) via `getActivityTypeGenerationCopy`:
`rubricCoverage` (what the rubric items should collectively cover),
`expectedAnswerCoverage` (what the expected-answer field captures), and
`guidance` (an extra system-prompt paragraph). Nouns in the generated copy derive
from the `labels` automatically. Omit the block to fall back to generic wording.

---

## What you don't touch

The dropdown (`listActivityTypes()`), the Question Card + preview labels
(`getActivityTypeLabels()`), the default prompt/eval builders
(`buildDefaultSystemPrompt` / `buildDefaultEvaluationPrompt` /
`buildDefaultConversationStart`), the rubric/answer generator
(`getActivityTypeGenerationCopy()`), and the multimodal directive composition all
read the registry — no per-type wiring needed.

---

## Checklist

- [ ] `activityTypes/types.ts` — add the kind to `ActivityTypeKind`
- [ ] `activityTypes/<kind>.ts` — create the file with prompt constants + exported `<KIND>_DEFINITION` (`ActivityTypeDefinition` with prompts, labels, defaults, optional `generation` / directives)
- [ ] `activityTypes/registry.ts` — import `<KIND>_DEFINITION` and add it to `ACTIVITY_TYPE_REGISTRY`
- [ ] _(if feedback should use the support language)_ `{{language}}` base + `{{#if support_language}}` override in the `evaluationPrompt`
- [ ] `types/assignment.ts` — widen `activity_type` (persisted text column; no migration). Also widen any other narrow `"learning" | "assessment"` literals (search the codebase).
- [ ] _(if it should show a friendly name)_ `AssignmentDetailClient.tsx` Pill display label
- [ ] `npx tsc --noEmit` + `npx eslint` clean

---

## Verify

1. **Teacher form**: the new type appears in the Activity Type dropdown; picking
   it applies its `defaults` (interaction type, language support, actions) and the
   Question Cards show its `labels`. Switching back to another type reverts both.
2. **Preview**: the assignment-detail / content-tab question preview
   (`QuestionView`) shows the same relabeling.
3. **Runtime** (multimodal): the assembled system prompt contains the type's
   persona + `buildMultimodalDirective`; a language-help turn uses its
   `buildLanguageSupportActiveDirective` when provided.
4. **Evaluation**: scoring uses the type's `evaluationPrompt`; if it has a
   `{{#if support_language}}` override and a support language is selected, the
   feedback is written in that support language (otherwise the primary language).
5. **Persistence**: create → reload edit; `activity_type` round-trips; legacy
   rows still default to `learning`.
