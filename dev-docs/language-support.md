# Language Support

Language support lets a learner get help in a secondary language (their "support language") during a multimodal conversation. It is a scaffold: the primary-language conversation continues normally, and when the learner asks for help, the model answers in the support language **inline, on the same turn**, then resumes the primary language.

TTS always renders in the **single primary voice** — there is no voice switch. The support language is purely a prompt concept: the model writes its support-language reply in that language's native script (via `SPEECH_SCRIPT_DIRECTIVE`), and the one multilingual primary voice speaks it.

---

## What it is

When support is enabled, a learner can:

- Ask for something to be explained in their support language
- Request a translation of the previous response
- Speak in their support language to signal they need help

The model detects these signals (or the learner presses the help button, which injects an explicit request) and replies in the support language for that one turn. The next turn continues in the primary language.

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
| `language` | Primary conversation language (locale code) — also the TTS voice/locale, always |
| `supportLanguageAvailable` | Support language locale, when configured for this learner |

The route resolves these into one of two states:

```
┌─────────────────────────────────────────────────────────────────┐
│                        Per-turn decision                        │
└─────────────────────────────────────────────────────────────────┘

  supportLanguageAvailable set (and ≠ primary)?
  ├── No  ──► [DISABLED]  no language directive
  └── Yes ──► [AVAILABLE] one always-on directive: reply inline in the
                          support language IF the learner asks; else primary
```

There is **no separate "active" turn and no voice switch**. TTS voice and synthesis locale are always the primary `language` (`resolveTtsVoice(ttsModelId, language)`), so a support-language reply is spoken by the same primary voice, in the support language's native script.

### DISABLED

No support language is configured for the learner. No language directive is added.

### AVAILABLE

Support is configured. The route adds a single directive (see `buildLanguageSupportDirective`) telling the model: when — and only when — the learner explicitly asks for help in the support language (asks to hear/translate/explain something in it, or speaks in it seeking help), reply for that one turn directly in the support language, in native script; otherwise continue in the primary language.

```
Learner speaks / types  (or presses the help button → injects an explicit request)
        │
        ▼
  Did the learner ask for help in the support language?
  ├── No  ────► normal primary-language reply
  └── Yes ────► reply in the support language THIS turn (primary voice),
               then resume the primary language next turn
```

The model decides per turn; no schema signal, no follow-up turn, no client re-fire.

---

## Activity-type extension point

Activity types can override the support directive via one optional hook on `ActivityTypeDefinition` (in `src/lib/activityTypes/types.ts`):

### `buildLanguageSupportDirective(input)`

| Return value | Effect |
|---|---|
| `string` | Use this directive instead of the default |
| `null` | Suppress language help entirely for this activity type (no directive added) |
| `undefined` (hook absent) | Use the default directive |

**Example — `speaking_practice`:** stays in character and continues the role-play in the support language when the learner asks, keeping scenario-specific terms in the primary language, and never offers help unprompted.

**Example — assessment (future):** could return `null` to keep test conditions consistent.

---

## Dual-transcript mode

When the learner's audio might contain support-language speech, the system can transcribe it in both languages simultaneously. The model receives both readings and writes the coherent one to `userTranscript` before generating its response.

This is enabled by passing `dualTranscript: { primaryLabel, supportLabel }` to the turn stream. The schema includes a `userTranscript` field (first, so it resolves early in the stream).

---

## Adding language support to a new activity type

1. The default AVAILABLE behavior (reply inline in the support language when asked) applies automatically when support is configured — usually nothing to do.
2. To customize the wording or role-play behavior, implement `buildLanguageSupportDirective` in the activity type's definition file (e.g. `src/lib/activityTypes/speaking_practice.ts`).
3. To disable language help entirely for the activity type, return `null` from that hook.

---

## Key files

| File | Role |
|---|---|
| `src/lib/ai/multimodal-directives.ts` | `buildLanguageSupportDirective` (the single support directive) |
| `src/lib/ai/chat-stream-object.ts` | `buildTurnSchema` (turn schema + stream orchestration) |
| `src/lib/activityTypes/types.ts` | `ActivityTypeDefinition` hook signature |
| `src/lib/activityTypes/<type>.ts` (e.g. `speaking_practice.ts`) | Hook implementation per activity type |
| `src/lib/activityTypes/registry.ts` | Aggregates the per-type definitions |
| `src/app/api/multimodal/turn/route.ts` | Resolves `languageHelpAvailable` from request body; TTS always primary voice |
