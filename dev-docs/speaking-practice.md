# Speaking Practice

Speaking practice is an activity type where the AI plays a character in a realistic scenario and the learner practices speaking in the target language. It differs from learning and assessment in two fundamental ways: the AI is a **role-play partner**, not a tutor or examiner, and the evaluation focuses on **speaking fluency and coverage**, not correctness of answers.

---

## How it differs from learning / assessment

| | Learning | Assessment | Speaking Practice |
|---|---|---|---|
| AI role | Tutor (explains, guides) | Examiner (probes understanding) | Role-play partner (stays in character) |
| Learner goal | Understand a topic | Demonstrate knowledge | Practice speaking through a scenario |
| Rubric items | Concepts to cover | Assessment criteria | Conversational aspects to act out |
| Evaluation emphasis | Learning progress | Knowledge demonstration | Speaking fluency + scenario coverage |
| Default interaction | Any | Any | Multimodal (voice) |
| Language support default | Off | Off | On |

---

## Teacher configuration

Teachers configure a speaking practice activity with:

- **Scenario** (the `question_prompt` field): describes the role-play situation (e.g. "Order food at a Japanese restaurant"). This is what the AI sets up and plays out.
- **Aspects to cover** (the `rubric` field): the distinct conversational moves the learner must make (e.g. "Ask for the menu", "Ask the price of a dish", "Say thank you"). The AI weaves these into the conversation naturally — it does not read them as a checklist.
- **Conversation guidance** (the `expected_answer` field, optional): hints for the AI about how to steer the dialogue and what good learner responses look like. Not shown to students.

---

## Conversation lifecycle

```
┌─────────────────────────────────────────────────────────────────┐
│                    Speaking practice lifecycle                   │
└─────────────────────────────────────────────────────────────────┘

  ┌──────────────────┐
  │   Intro brief    │  AI explains the scenario and asks if the learner is ready.
  │  (support lang)  │  Delivered in the support language when available.
  └────────┬─────────┘
           │ learner confirms ready
           ▼
  ┌──────────────────┐
  │   Role-play      │  AI stays in character. Guides learner to cover each aspect
  │  (primary lang)  │  through natural conversation. Keeps turns short.
  │                  │
  │  ┌────────────┐  │  If learner asks for help in support language:
  │  │  Support   │  │    → AI replies in the support language INLINE, same turn
  │  │  language  │  │    → stays in character, continues the role-play in it
  │  │  reply     │  │    → next turn resumes in primary language
  │  └────────────┘  │    (no separate turn; same single voice throughout)
  └────────┬─────────┘
           │ all aspects covered / end condition met
           ▼
  ┌──────────────────┐
  │   Evaluation     │  Scores each aspect + overall feedback.
  │                  │  Written in support language when available.
  └──────────────────┘
```

Every turn — intro brief, role-play, and support-language help — is spoken in the **same single primary voice**. The support language only changes the *words* the model generates (in native script), never the TTS voice.

---

## Language support integration

Speaking practice has the deepest integration with language support of any activity type. It overrides the single language-support hook and handles help inline — in the same primary voice as the role-play.

### Intro brief in support language

The `conversationStart.first_question` template checks `{{#if support_language}}` and instructs the AI to deliver the entire opening — scenario explanation, what to cover, "are you ready?" — in the support language. The role-play itself starts in the primary language once the learner confirms. There is no special turn type; it is just the first turn, spoken in the primary voice.

### Inline support-language help (mid role-play)

The `buildLanguageSupportDirective` hook returns a role-play-aware directive. Two key points: the AI is told **not to offer support-language help unprompted** (stay in the scene, respond only when the learner explicitly asks); and when the learner does ask, the AI replies **in the support language inline, on that same turn** — staying in character and continuing the role-play in it, keeping scenario-specific terms from the primary language as they are. The next turn resumes the primary language.

```
Learner speaks (primary language, or support language seeking help)
         │
         ▼
  Learner explicitly asked for support-language help?
  ├── No  ──► stay in character, continue role-play in primary language
  └── Yes ──► reply in the support language THIS turn (same primary voice),
              then resume the primary language next turn
```

There is no `requestLanguageHelp` signal, no empty-speech precursor, and no second turn. The manual help button injects an explicit request into the conversation and runs a normal turn — the same path.

### Evaluation in support language

The `SPEAKING_EVALUATION` template includes:

```handlebars
{{#if support_language}}
LANGUAGE OVERRIDE: The learner had {{support_language}} available as a support language.
Write ALL feedback (both per-aspect and overall) in {{support_language}} instead of {{language}}.
{{/if}}
```

When a support language was available, all evaluation feedback is written in that language so the learner can read it without struggling with the primary language.

---

## Multimodal directive

The `buildMultimodalDirective` hook appends two instructions to the system prompt on every multimodal turn:

1. **Stay in character**: short natural turns, let the student talk, draw out scenario aspects through conversation flow rather than direct questions.
2. **Write in native script**: the `speech` field must use the native script of the language being spoken (e.g. Devanagari for Hindi). Never romanize. English proper nouns may stay in Roman script.

---

## Evaluation

Evaluation uses `SPEAKING_EVALUATION` and `SPEAKING_EVALUATION_SYSTEM_PERSONA`:

- **Generous scoring**: reward partial effort and good-faith attempts; only deduct for clear gaps
- **Actionable feedback**: for each aspect, name what was wrong or missed and give a concrete correction
- **Support language override**: all feedback written in support language when available

The evaluator persona sets the frame: "supportive speaking coach, not strict examiner."

---

## Key files

| File | Role |
|---|---|
| `src/lib/activityTypes/speaking_practice.ts` | Full definition: persona, task, evaluation, hooks |
| `src/lib/activityTypes/registry.ts` | Aggregates all activity-type definitions; `getActivityTypeDefinition()` |
| `src/lib/ai/multimodal-directives.ts` | Multimodal directive + language-support dispatch |
| `src/lib/ai/chat-stream-object.ts` | Turn schema + streamObject orchestration |
| `dev-docs/language-support.md` | Language support system and extension points |
| `dev-docs/adding-activity-types.md` | How to add a new activity type |
