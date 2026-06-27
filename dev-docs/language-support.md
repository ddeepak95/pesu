# Language Support

Language support lets a learner request responses in a secondary language (their "support language") during a multimodal conversation. It is designed as a scaffold: the primary-language conversation continues normally, and the learner can invoke support when they need it.

---

## What it is

When support is enabled, a learner can:

- Ask for something to be explained in their support language
- Request a translation of the previous response
- Speak in their support language to signal they need help

The model detects these signals and the system delivers a full response in the support language using a matching TTS voice. On the next turn, the conversation resumes in the primary language.

---

## Configuration

Language support is configured at two levels before it reaches runtime:

```
Class
  └─ language_config.supportLanguageEnabled    ← pre-enables on new assignments
  └─ language_config.defaultSupportLanguage    ← default locale (e.g. "hi")
  └─ language_config.lockSupportLanguage       ← prevent student from changing

Assignment (bot_prompt_config.multimodal_actions.languageSupport)
  └─ enabled          ← is support available at all?
  └─ defaultLanguage  ← locale code for the support language
  └─ locked           ← prevent student from changing during session
```

Activity types may also pre-enable language support via their `defaults.multimodal.languageSupportEnabled` field (e.g. `speaking_practice` enables it by default).

---

## Runtime flow

Each `/api/multimodal/turn` request carries:

| Field | Meaning |
|---|---|
| `language` | Primary conversation language (locale code) |
| `speechLanguage` | Language this turn will be spoken in (= support language on help turns) |
| `supportLanguageAvailable` | Support language locale when configured but not yet invoked |

The API route resolves these into one of three scenarios:

```
┌─────────────────────────────────────────────────────────────────┐
│                        Per-turn decision                        │
└─────────────────────────────────────────────────────────────────┘

  supportLanguageAvailable set?
  ├── No  ──────────────────────────────► [DISABLED] no directive, requestLanguageHelp forced null
  └── Yes
        │
        └─ isSupportTurn? (speechLanguage ≠ language)
             ├── Yes ─────────────────► [ACTIVE] respond in support language
             └── No  ─────────────────► [AVAILABLE] model may offer help on request
```

### DISABLED

No language support is configured. The `requestLanguageHelp` schema field is forced to `z.null()` so the model cannot signal a help request even if it hallucinated one.

### AVAILABLE (inactive turn)

Support is configured but this turn is in the primary language. The model receives:

- A directive explaining when to set `requestLanguageHelp: true`
- The `requestLanguageHelp` schema field enabled

When the model sets `requestLanguageHelp: true`, it also sets `speech` to an empty string. The client detects this, switches `speechLanguage` to the support locale, and fires a new turn — which becomes an ACTIVE turn.

```
Learner speaks / types
        │
        ▼
  Model: requestLanguageHelp null?
  ├── null ────► normal primary-language response (TTS in primary language)
  └── true ────► speech = ""  ──► client fires support-language turn
                                          │
                                          ▼
                                   ACTIVE turn (see below)
```

### ACTIVE (support-language turn)

`languageSupport.active = true` is set by the route. The model is instructed to respond entirely in the support language. The TTS voice is already set to match `speechLanguage`.

Default behavior: faithful translation / direct answer in the support language, with technical terms preserved in the primary language.

After this turn, the client resets `speechLanguage` to the primary language and conversation resumes normally.

---

## Activity-type extension points

Activity types can override both ACTIVE and AVAILABLE behavior by implementing optional hooks on `ActivityTypeDefinition` (in `src/lib/activityTypes/types.ts`).

### `buildLanguageSupportActiveDirective(input)`

Overrides the instruction for ACTIVE turns (when the model must respond in the support language).

| Return value | Effect |
|---|---|
| `string` | Use this directive instead of the default translation instruction |
| `null` | Fall back to the default literal-translation directive |

**Example — `speaking_practice`:** Instead of translating the previous message, the model stays in character and continues the role-play scenario in the support language.

### `buildLanguageSupportAvailableDirective(input)`

Overrides the instruction for AVAILABLE turns (when the model may offer help).

| Return value | Effect |
|---|---|
| `string` | Use this directive instead of the default |
| `null` | Suppress language help entirely — `requestLanguageHelp` is also forced to null in the schema |
| `undefined` (hook absent) | Use the default directive |

**Example — `speaking_practice`:** Uses a role-play-aware version that tells the model not to interrupt the scenario to offer help unprompted — it should only respond when the learner explicitly asks.

**Example — assessment (future):** Could return `null` to prevent the model from ever offering the support language during an assessment, keeping test conditions consistent.

---

## Dual-transcript mode

When the learner's audio might contain support-language speech, the system can transcribe it in both languages simultaneously. The model receives both readings and writes the coherent one to `userTranscript` before generating its response.

This is enabled by passing `dualTranscript: { primaryLabel, supportLabel }` to the turn stream. The schema includes a `userTranscript` field (first, so it resolves early in the stream).

---

## Adding language support to a new activity type

1. Decide whether the default AVAILABLE or ACTIVE behavior is appropriate.
2. If not, add one or both hooks to the activity type's registry entry in `src/lib/activityTypes/registry.ts`.
3. To disable language help entirely: return `null` from `buildLanguageSupportAvailableDirective`.
4. To customize how active turns respond: return a directive string from `buildLanguageSupportActiveDirective`.

See `speaking_practice` in the registry for a complete example of both hooks.

---

## Key files

| File | Role |
|---|---|
| `src/lib/ai/multimodal-directives.ts` | `buildLanguageSupportDirective`, `shouldOfferLanguageHelp` |
| `src/lib/ai/chat-stream-object.ts` | `buildTurnSchema` (turn schema + stream orchestration) |
| `src/lib/activityTypes/types.ts` | `ActivityTypeDefinition` hook signatures |
| `src/lib/activityTypes/registry.ts` | Hook implementations per activity type |
| `src/app/api/multimodal/turn/route.ts` | Resolves `languageSupport` / `languageHelpAvailable` from request body |
