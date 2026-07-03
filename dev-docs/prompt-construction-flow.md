# Prompt construction flow

How the two prompts actually sent to a model — the **conversation-turn system prompt**
(multimodal tutoring turns) and the **evaluation/grading prompt** — are assembled from teacher
input, template defaults, and runtime scaffolding. Every node below cites the exact source
file/function it comes from; nothing here is aspirational.

## Legend

| Symbol | Category | Meaning |
| --- | --- | --- |
| 🟦 | **User-authored** | Free text a teacher or template author actually typed; persisted per-assignment (or per-template) and editable. |
| ⬜ | **Deterministic** | Fixed or type-selected, code-owned text. Same for every assignment of that shape; not editable per-assignment. |
| 🟨 | **Optional / conditional** | Only present when a toggle is on or a runtime condition holds. |

---

## Diagram A — Conversation-turn system prompt

```mermaid
flowchart TD
    subgraph SEED["Seed time — resolving a definition"]
        REG["⬜ Built-in ActivityTypeDefinition<br/>src/lib/activityTypes/{learning,assessment,<br/>speaking_practice,code-review}.ts"]
        DBT["🟦 Custom/cloned template row<br/>activity_templates.definition"]
        RESOLVE["resolveActivityTemplate() / DB fetch<br/>src/lib/activityTypes/templateResolver.ts<br/>→ TemplateDefinition"]
        REG --> RESOLVE
        DBT --> RESOLVE
    end

    subgraph AUTHOR["Assignment authoring — AssignmentForm.tsx"]
        SP["🟦 system_prompt (editable, seeded from resolved definition)"]
        CS["🟦 conversation_start.first_question / subsequent_questions"]
        ACTS["🟨 availableActions toggles"]
        AG["🟦 actionGuidance — one hand-written fragment per<br/>action, on its card, only editable while that<br/>action is toggled on (Template Editor); auto-prefixed<br/>with the action's own label at composition time"]
        LS["🟨 languageSupport toggle + default language"]
        ECI["🟨 endConversation.customInstruction<br/>(UI exists, NOT read at runtime — see Known gaps)"]
        SC["🟨 shared_context (teacher's extra context text)"]
        SI["🟨 student_instructions"]
        FF["🟨 feedback_focus areas"]
    end

    RESOLVE --> SP
    RESOLVE --> CS
    RESOLVE --> AG
    SAVE["Persisted onto the assignments row:<br/>bot_prompt_config, activity_definition_snapshot,<br/>shared_context, student_instructions, feedback_focus<br/>(save time / 'Update from template')"]
    SP --> SAVE
    CS --> SAVE
    ACTS --> SAVE
    AG --> SAVE
    LS --> SAVE
    ECI --> SAVE
    SC --> SAVE
    SI --> SAVE
    FF --> SAVE

    subgraph INTERP["Client-side interpolation — student's browser"]
        HOOK["useInterpolatedPrompts()<br/>src/hooks/useInterpolatedPrompts.ts<br/>→ src/lib/promptInterpolation.ts"]
        IF["Step 1: resolve {{#if var}}...{{/if}} conditional blocks"]
        SUB["Step 2: substitute {{variable}} placeholders<br/>🟦 static: title, instructions, question_prompt, rubric,<br/>expected_answer, context_for_ai/shared_context, language,<br/>support_language, max_attempts, total_questions<br/>🟨 runtime: attempt_number, question_order, file_submissions,<br/>answer_text (see src/lib/promptTemplates.ts PROMPT_VARIABLES)"]
        HOOK --> IF --> SUB
        RESULT_SP["🟦 Interpolated system_prompt"]
        RESULT_GR["🟦 Interpolated greeting"]
        SUB --> RESULT_SP
        SUB --> RESULT_GR
    end

    SAVE --> HOOK

    POST["POST /api/multimodal/turn<br/>system_prompt, activityType, activityDefinitionSnapshot,<br/>availableActions, endConversationConfig,<br/>supportLanguageAvailable?, latestTranscriptCandidates?,<br/>greeting (first turn only)"]
    RESULT_SP --> POST
    RESULT_GR --> POST

    subgraph SERVER["Server composition — resolveMultimodalTurnCall()<br/>src/lib/ai/chat-stream-object.ts<br/>→ buildMultimodalDirectives()<br/>src/lib/ai/multimodal-directives.ts"]
        RESOLVE2["resolveActivityDefinitionForRuntime(activityType, snapshot)<br/>src/lib/activityTypes/templateResolver.ts<br/>→ prefers activityDefinitionSnapshot; falls back to the<br/>kind-registry for legacy/missing/malformed snapshots"]
        BASE["system = system_prompt + directive block"]
        D1["⬜ SPEECH_FORMAT_DIRECTIVE — always present<br/>(JSON output / TTS-safe formatting rules)"]
        D2["⬜ SAFETY_DIRECTIVE — always present<br/>(canonical, shared with evaluation)"]
        D3["🟨⬜ buildActionsDirective(availableActions)<br/>per enabled action: each action's own<br/>buildDirective() mechanics<br/>src/lib/multimodal/actions/registry.ts<br/>('Always set action to null' when none enabled)"]
        D4["⬜🟦 End-conversation directive:<br/>⬜ fixed base rule +<br/>🟦 the resolved definition's endConditionInstruction"]
        D5["🟨🟦 buildActionGuidance(actionGuidance, availableActions)<br/>per-action pedagogy fragments (e.g. 'use MCQ<br/>sparingly...'), only the fragment for each<br/>currently-enabled action is included, each auto-<br/>prefixed with ⬜ that action's own registry label"]
        D6["🟨 Language-support directive — only when a<br/>support language is configured:<br/>⬜ generic default text, OR<br/>🟦 the resolved definition's full-replace languageSupportDirective"]
        D7["🟨⬜ Dual-transcript note — only when the learner's<br/>audio was transcribed in two languages at once"]
        D8["🟨🟦 First-turn greeting instruction<br/>'[Instructions for your first response]: {greeting}'<br/>— only when messages.length === 0"]
        RESOLVE2 --> BASE --> D1 --> D2 --> D3 --> D4 --> D5 --> D6 --> D7 --> D8
    end

    POST --> RESOLVE2
    D8 --> OUT["Final system string sent to streamObject for this turn"]
```

### Known gaps in Diagram A

- **`endConversation.customInstruction`** (assignment-level, `EndConversationConfig`) is sent in
  the turn request body but **not currently read** when composing D4 — kept as a currently-unused
  type/UI (a deliberate Phase-0 decision — see `dev-docs/activity-templates-plan.md`).

---

## Diagram B — Evaluation / grading prompt

```mermaid
flowchart TD
    subgraph SYS["System message — buildEvaluationSystemMessage()<br/>src/lib/activityTypes/registry.ts:51-57"]
        PERSONA["🟦 evaluationSystemPersona — hand-written per<br/>activity type (e.g. 'You are an expert<br/>educational evaluator...')"]
        FOOTER["⬜ EVALUATION_SYSTEM_SHARED_FOOTER — deterministic<br/>output-format rules: structured feedback_output<br/>blocks, section-title guidance, plain-text rule"]
        SAFETY["⬜ SAFETY_DIRECTIVE — same canonical constant<br/>as the conversation-turn prompt"]
        PERSONA --> FOOTER --> SAFETY
    end
    SYSOUT["System message sent to the grading model"]
    SAFETY --> SYSOUT

    subgraph USR["User message — evaluateSubmission()<br/>src/lib/ai/evaluateSubmission.ts"]
        DECIDE{"🟨 Did the teacher set a<br/>custom evaluation_prompt?"}
        CUSTOM["🟦 customEvaluationPrompt used verbatim<br/>(itself interpolated client-side the same<br/>way as the system prompt)"]
        BUILTIN["⬜ Deterministic built-in template:<br/>🟨 sharedContext (if set) +<br/>🟦 questionPrompt + rubric (teacher-authored) +<br/>the student's actual answerText +<br/>⬜ fixed grading instructions"]
        DECIDE -- yes --> CUSTOM
        DECIDE -- no --> BUILTIN
        FOCUS["🟨 Feedback-focus append — only when the teacher<br/>set feedback_focus areas:<br/>🟦 the teacher's own focus-area titles/descriptions<br/>(appended regardless of custom-prompt mode)"]
        CUSTOM --> FOCUS
        BUILTIN --> FOCUS
    end
    USROUT["User message sent to the grading model"]
    FOCUS --> USROUT

    SYSOUT --> RESULT["generateStructured() call →<br/>rubric_scores + structured feedback_output"]
    USROUT --> RESULT
```

---

## Source files referenced

| Area | File |
| --- | --- |
| Built-in activity type definitions | `src/lib/activityTypes/{learning,assessment,speaking_practice,code-review}.ts` |
| Template resolution (registry vs. DB) | `src/lib/activityTypes/templateResolver.ts`, `src/lib/activityTypes/templates.ts` |
| Assignment authoring | `src/components/Teacher/Assignments/AssignmentForm.tsx` |
| Client-side interpolation engine | `src/hooks/useInterpolatedPrompts.ts`, `src/lib/promptInterpolation.ts`, `src/lib/promptTemplates.ts` |
| Turn request body | `src/components/Shared/AssessmentInputs/MultimodalInputArea.tsx`, `src/app/api/multimodal/turn/route.ts` |
| Server prompt composition | `src/lib/ai/chat-stream-object.ts`, `src/lib/ai/multimodal-directives.ts` |
| Per-action mechanics directives | `src/lib/multimodal/actions/registry.ts` |
| Evaluation system message | `src/lib/activityTypes/registry.ts` |
| Evaluation user message | `src/lib/ai/evaluateSubmission.ts` |
