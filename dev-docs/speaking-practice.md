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
  │  │  Support   │  │    → requestLanguageHelp = true
  │  │  language  │  │    → ACTIVE turn fires in support language
  │  │  turn      │  │    → AI continues role-play in support language
  │  └────────────┘  │    → next turn resumes in primary language
  └────────┬─────────┘
           │ all aspects covered / end condition met
           ▼
  ┌──────────────────┐
  │   Evaluation     │  Scores each aspect + overall feedback.
  │                  │  Written in support language when available.
  └──────────────────┘
```

---

## Language support integration

Speaking practice has the deepest integration with language support of any activity type. It overrides both language support hooks.

### Intro brief in support language

The `conversationStart.first_question` template checks `{{#if support_language}}` and instructs the AI to deliver the entire opening — scenario explanation, what to cover, "are you ready?" — in the support language. The role-play itself starts in the primary language once the learner confirms.

### Available turns (mid role-play)

The `buildLanguageSupportAvailableDirective` hook returns a role-play-aware version of the offer directive. Key difference from the default: the AI is told **not to offer support language help unprompted** — it should stay in the scene and only respond when the learner explicitly asks.

```
Learner speaks (primary language, or support language seeking help)
         │
         ▼
  Learner explicitly asked for support language help?
  ├── No  ──► stay in character, continue role-play normally
  └── Yes ──► requestLanguageHelp = true, speech = ""
                      │
                      ▼
               ACTIVE support-language turn (see below)
```

### Active turns (support language response)

The `buildLanguageSupportActiveDirective` hook returns a directive that says: **continue the role-play scenario in the support language**. Unlike the default (which translates the previous message), the AI stays in character and helps the learner understand and continue — keeping scenario-specific terms from the primary language as they are.

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
| `src/lib/activityTypes/registry.ts` | Full definition: persona, task, evaluation, hooks |
| `src/lib/ai/chat-stream-object.ts` | Multimodal directive and language support dispatch |
| `docs/language-support.md` | Language support system and extension points |
| `docs/adding-activity-types.md` | How to add a new activity type |
