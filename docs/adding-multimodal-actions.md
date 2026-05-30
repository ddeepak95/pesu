# Adding a new multimodal action

This guide explains how to add a new **action** to multimodal chat — a piece of
rich pedagogical content (a quiz, an image, an equation, a flashcard, …) that
the tutor can show the learner during a conversation. MCQ is the reference
implementation; every step below points at the real MCQ code you can copy.

> For the architectural background (why there are two LLM calls, the SSE
> protocol, persistence) see [`multimodal-orchestration-plan.md`](./multimodal-orchestration-plan.md).

---

## Mental model

A turn that fires an action makes **two LLM calls**:

| | Call 1 — orchestrator | Call 2 — content |
|---|---|---|
| Where | `createMultimodalTurnStream` → `streamObject` | your handler → `generateObject` |
| Produces | `{ speech, action, endConversation }` — `action` is only the **request** (`{kind, …params}`) | the **payload** (the actual content shown to the learner) |
| Model | `text.chat_tutoring` binding | the action's **own** binding (e.g. `text.mcq_generation`), inherits the chat model unless overridden |
| Timing | streams speech to TTS immediately | dispatched in parallel, awaited before `done` |

So an action has two schemas:

- **Input schema** (`ActionInput`) — what Call 1 emits to *request* the action.
- **Payload** (`ActionPayload`) — what Call 2 *generates* and the frontend renders.

The **action registry** (`src/lib/multimodal/actions/registry.ts`) ties everything
together. Once you register a kind, the turn schema, system-prompt directives,
the teacher toggle, and capability gating all pick it up automatically.

> **Language.** Call 2 generates content in isolation — it does **not** inherit
> the conversation's language from Call 1. The turn route passes the
> conversation's primary language to every handler as `args.languageLabel`
> (a human-readable name, e.g. `"Hindi"`). Your handler **must** instruct the
> generator to author the payload in `languageLabel` so the card matches the
> spoken conversation; otherwise content defaults to English. (Language *support*
> turns don't generate actions — actions always use the primary language.)

---

## Step-by-step

We'll add a hypothetical `flashcard` action (a term + definition the tutor shows
to reinforce a concept). Substitute your own kind throughout.

### 1. Types — `src/lib/multimodal/actions/types.ts`

Add the kind and its **payload** interface, then add the payload to the
`ActionPayload` union.

```ts
export type ActionKind = "mcq" | "image" | "video" | "equation" | "animation" | "flashcard";

export interface FlashcardActionPayload {
  kind: "flashcard";
  term: string;
  definition: string;
}

export type ActionPayload = McqActionPayload | FlashcardActionPayload;
```

This module is **pure** (no server imports) — it is safe to import from both the
API route and client components.

### 2. Input schema — `src/lib/multimodal/actions/schema.ts`

Add the **request** schema (the params Call 1 fills in) and add it to the
discriminated union. Every input schema must have a `kind` literal.

```ts
export const flashcardActionInputSchema = z.object({
  kind: z.literal("flashcard"),
  topic: z.string().describe("The concept the flashcard should reinforce."),
});

export const actionInputSchema = z.discriminatedUnion("kind", [
  mcqActionInputSchema,
  flashcardActionInputSchema,
]);
```

Keep the input schema small — it is what the orchestrator decides on, not the
content itself.

### 3. Handler — `src/lib/multimodal/actions/flashcard.ts`

Generate the payload (Call 2) and **persist it before enqueuing** so it survives
a mid-stream disconnect. Mirror `mcq.ts`:

```ts
import { generateObject } from "ai";
import { z } from "zod";

import { insertChatMessageAction } from "@/lib/queries/chatMessageActions";
import type { FlashcardActionPayload } from "./types";
import type { DispatchActionArgs } from "./dispatcher";
import type { ActionInput } from "./schema";

const flashcardResultSchema = z.object({
  term: z.string(),
  definition: z.string(),
});

type FlashcardAction = Extract<ActionInput, { kind: "flashcard" }>;

export async function handleFlashcardAction(
  args: DispatchActionArgs & { action: FlashcardAction },
): Promise<void> {
  const { id, action, model, providerOptions, enqueue, supabase, submissionId, chatMessageId, languageLabel } = args;

  const { object } = await generateObject({
    model,            // ← the action's own model (Call 2), resolved by the route
    providerOptions,
    schema: flashcardResultSchema,
    system: "Write one concise flashcard (term + plain-language definition) for a tutoring session.",
    // Author the content in the conversation's primary language (see "Language" note above).
    prompt: `Topic: ${action.topic}\nWrite the term and definition in ${languageLabel}.`,
  });

  const payload: FlashcardActionPayload = { kind: "flashcard", ...object };

  await insertChatMessageAction(supabase, {
    id, chatMessageId, submissionId, kind: "flashcard", payload,
  });

  enqueue({ type: "action_payload", id, kind: "flashcard", data: payload });
}
```

Register it in the dispatcher — `src/lib/multimodal/actions/dispatcher.ts`:

```ts
switch (args.action.kind) {
  case "mcq":
    return handleMcqAction({ ...args, action: args.action });
  case "flashcard":
    return handleFlashcardAction({ ...args, action: args.action });
  default:
    throw new Error(`Unknown action kind: ${(args.action as { kind: string }).kind}`);
}
```

`args.model` / `args.providerOptions` are already the action-specific model the
turn route resolved from your `appFunctionKey` (step 5) — just use them.

### 4. Registry entry — `src/lib/multimodal/actions/registry.ts`

This is the keystone. Add an `ActionDefinition`:

```ts
export const ACTION_REGISTRY: Partial<Record<ActionKind, ActionDefinition>> = {
  mcq: { /* … */ },
  flashcard: {
    kind: "flashcard",
    label: "Flashcards",                                   // teacher toggle label
    description: "The tutor can show a term + definition card.",
    implemented: true,
    requiredTasks: ["text_generation"],                    // model-support gating
    appFunctionKey: "text.flashcard_generation",           // Call 2 model binding
    inputSchema: flashcardActionInputSchema,
    buildDirective: () =>
      'Reinforce key concepts with flashcards: set `action.kind` to "flashcard" ' +
      "and `action.topic` to the concept. In your `speech`, mention a card will " +
      "appear on screen. At most one action per turn.",
  },
};
```

After this, `buildActionSchemaField` (turn schema), `buildActionsDirective`
(system prompt), and the teacher toggle UI all include your action with no
further wiring.

### 5. Catalog binding — per-action model in Platform AI settings

Add the `AppFunctionKey` — `src/lib/ai/catalog/appFunctions.ts`:

```ts
export type AppFunctionKey =
  | "text"
  | "text.chat_tutoring"
  | …
  | "text.mcq_generation"
  | "text.flashcard_generation";
```

Add the sub-function — `src/lib/ai/catalog/data.ts`, inside
`CATALOG_FUNCTIONS[text].subFunctions`:

```ts
{
  key: "flashcard_generation",
  label: "Flashcard generation",
  description: "Author the term/definition cards the tutor shows in multimodal chat.",
  consumers: ["Multimodal assessment"],
  // requiredTasks: omit → inherits the parent `text` requirement (text_generation)
},
```

That's all the settings UI needs — a "Flashcard generation" override row appears
automatically under **Text-based features → Customize per feature** at
platform/institution/class scope. Unset, it inherits the chat model.

### 6. Capability / new model task — _only if_ the action needs more than text

If your action needs a capability beyond text generation (e.g. image
generation), do two extra things — otherwise **skip this step**:

- Add a `ModelTask` in `src/lib/ai/catalog/types.ts` (e.g. `"image_generation"`)
  and tag capable models in `src/lib/ai/catalog/data.ts` (`tasks: [...]`).
- Set `requiredTasks` on the **sub-function** entry (step 5) and on the
  **registry** entry (step 4) to that task.

The gating then "just works": `resolveAvailableActionKindsForClass` only marks
the action available when a configured model satisfies `requiredTasks`, and the
teacher toggle is disabled (with a tooltip) otherwise.

### 7. Frontend rendering — `src/components/Shared/KonvoVoice/ActionCard.tsx`

Add a render case for your payload. The SSE plumbing
(`action_start` → skeleton, `action_payload` → ready, `action_error` → drop) in
`MultimodalInputArea.tsx` is generic and needs no change.

```tsx
switch (action.payload.kind) {
  case "mcq":
    return <MCQCard … />;
  case "flashcard":
    return (
      <div className="rounded-xl border border-border/60 bg-background/70 p-3">
        <p className="text-sm font-semibold">{action.payload.term}</p>
        <p className="mt-1 text-sm text-muted-foreground">{action.payload.definition}</p>
      </div>
    );
  default:
    return null;
}
```

Optionally extend `ActionSkeleton` with a kind-specific "Preparing …" label.

> **Learner-interactive actions** (like MCQ, where the learner answers): add the
> interaction field to `PendingAction` in `actionTypes.ts` (MCQ uses
> `answeredIndex`), persist it via the generic `response` jsonb column
> (`updateChatMessageActionAnswer` in `chatMessageActions.ts`), and add a
> `PATCH` route like `api/multimodal/mcq-answer`. Most content actions
> (image, equation, flashcard) are display-only and need none of this.

---

## Checklist

- [ ] `actions/types.ts` — `ActionKind` + payload interface + `ActionPayload` union
- [ ] `actions/schema.ts` — input schema + add to `actionInputSchema`
- [ ] `actions/<kind>.ts` — handler (`generateObject`, author content in `args.languageLabel`, persist before enqueue)
- [ ] `actions/dispatcher.ts` — `case` for the new kind
- [ ] `actions/registry.ts` — `ActionDefinition` (`implemented: true`)
- [ ] `catalog/appFunctions.ts` + `catalog/data.ts` — `AppFunctionKey` + sub-function
- [ ] `catalog/types.ts` + `catalog/data.ts` — new `ModelTask` **(only if** capability beyond text)
- [ ] `ActionCard.tsx` — render case (+ skeleton label)
- [ ] _(interactive only)_ `actionTypes.ts` response field + `PATCH` route + `chatMessageActions` helper

What you **don't** touch: `chat-stream-object.ts` (turn schema + directives read
the registry), `MultimodalActionsConfigEditor.tsx` (toggle maps over the
registry), the SSE event handling, or the settings UI.

---

## Verify

1. `npx tsc --noEmit` and `npx eslint` — clean.
2. **AI settings**: a "<Kind> generation" override row appears under Text-based
   features; binding a different model persists; unset inherits the Text default.
   If you added a `ModelTask`, the model dropdown is filtered to capable models.
3. **Teacher editor** (multimodal assignment): the action's toggle appears in
   AI Config → Actions, enabled when a capable model is configured, disabled with
   a tooltip when not.
4. **Runtime**: enable the action, run a turn that triggers it. Confirm the
   server log shows Call 2 using your `appFunctionKey`'s model, the payload
   persists to `chat_message_actions`, and the card renders.
