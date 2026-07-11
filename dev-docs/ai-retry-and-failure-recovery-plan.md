# AI Retry & Failure-Recovery Plan

Make every AI invocation failure recoverable in place: short silent server retries, then a user-facing **Retry** button — in the multimodal chat, action cards, and the evaluation/feedback flow — with machine-readable error codes end to end and no user content ever lost.

> **Scope note (2026-07-11):** the text-only chat feature (`ChatInputArea` + `/api/chat-assessment` + `chat-stream.ts`) was removed from the codebase entirely — the multimodal interface is the only conversational surface. This plan therefore covers multimodal, actions, and evaluate only.

Related docs: [multimodal-orchestration-plan.md](./multimodal-orchestration-plan.md) · [adding-multimodal-actions.md](./adding-multimodal-actions.md) · [multimodal-interaction-config-plan.md](./multimodal-interaction-config-plan.md)

---

## 1. Motivation

Today, AI invocation failures are terminal from the user's perspective. The user's content is already safe (see §2), but the only recovery path is "do it again from scratch."

| Flow | Current behavior on failure | User impact |
|---|---|---|
| **Multimodal turn** (`/api/multimodal/turn`) | Server silently retries up to 4× with backoff up to 30s each (only before first byte), then emits `{type:"error"}` SSE. Client shows a toast + alert banner (`MultimodalInputArea.tsx`). | Up to ~60s of dead air on a rate limit, then a dead end — the student must re-speak/re-send. |
| **Action generation** (Call 2: MCQ, suggested response, display content) | `generateObject` in `src/lib/multimodal/actions/*.ts` has **zero retry**. On `{type:"action_error"}` the client **silently removes the card**. | The tutor's spoken reference ("try this question…") dangles; the student never sees the activity and gets no signal anything failed. |
| **Evaluation / feedback** (`/api/evaluate`) | Synchronous request; on failure a blanket `500` + toast (`AssessmentShell.tsx`). No record in submission tables. | Student must fully resubmit, creating a brand-new attempt flow, with no explanation of what happened. |

## 2. Core Principles

1. **User content is never lost.** This is already true and must stay true:
   - Student `chat_messages` rows are inserted before / independent of the AI call (turn route inserts the student row before the stream starts in single-transcript mode; dual-STT/direct-audio has fallback inserts).
   - Utterance audio is salvaged in the client catch block via `persistUtteranceAudio`.
   - Input areas keep local answer state when evaluation throws.
2. **Every AI failure is recoverable in place.** Silent server retries are short (2 attempts for interactive flows); manual retries via a Retry button are unlimited.
3. **Errors carry machine-readable codes end to end** — through SSE events and JSON responses — so the client decides UI treatment from `code`/`retryable`, never by string-matching messages.
4. **Retry button by default.** Retryable and `UNKNOWN` errors show a Retry button; only positively-identified permanent failures (misconfiguration, capability mismatch, revoked access, bad request) show guidance instead.

## 3. Error Taxonomy

New module `src/lib/ai/errors.ts` (composes with `src/lib/ai/retry.ts`, no semantic changes there beyond exporting `getRetryAfterMs`):

```ts
export type AiErrorCode =
  | "RATE_LIMITED"         // 429
  | "PROVIDER_UNAVAILABLE" // 503 / overloaded
  | "NETWORK"              // fetch TypeError, socket reset
  | "TIMEOUT"
  | "AI_NOT_CONFIGURED"    // existing AI_NOT_CONFIGURED_ERROR_CODE
  | "CAPABILITY_MISMATCH"  // existing MULTIMODAL_ERROR_CODES.AUDIO_INPUT_CAPABILITY_MISMATCH
  | "INTEGRITY_REVOKED"    // existing integrity access revoked code
  | "BAD_REQUEST"          // 400/422, schema-invalid input
  | "UNKNOWN";

export interface ClassifiedAiError {
  code: AiErrorCode;
  message: string;
  retryable: boolean;      // true for RATE_LIMITED, PROVIDER_UNAVAILABLE, NETWORK, TIMEOUT, UNKNOWN
  retryAfterMs?: number;   // from Retry-After header when present
}

export function classifyAiError(err: unknown): ClassifiedAiError;
export function isRetryableCode(code: AiErrorCode | undefined): boolean; // undefined/UNKNOWN ⇒ true
```

| Code | Source | Retryable | User copy (indicative) |
|---|---|---|---|
| `RATE_LIMITED` | HTTP 429 | ✅ | "The tutor is busy right now — try again in a moment." |
| `PROVIDER_UNAVAILABLE` | HTTP 503 | ✅ | "The AI service is temporarily unavailable." |
| `NETWORK` | fetch `TypeError` | ✅ | "Connection problem — check your network and retry." |
| `TIMEOUT` | abort/timeout signals | ✅ | "That took too long — please retry." |
| `UNKNOWN` | anything unclassified | ✅ | "Something went wrong — please retry." |
| `AI_NOT_CONFIGURED` | `AiNotConfiguredError` | ❌ | "AI isn't set up for this class — contact your teacher." |
| `CAPABILITY_MISMATCH` | audio-input capability re-check (409) | ❌ | "This model doesn't support audio input." |
| `INTEGRITY_REVOKED` | integrity access revoked (403) | ❌ | routes to `onIntegrityAccessRevoked` as today |
| `BAD_REQUEST` | 400/422 | ❌ | "Something about this request was invalid." |

Classification delegates to the existing `isRetryableProviderError` / `getRetryAfterMs` logic and recognizes the three existing ad-hoc error-code constants, so the client has a single decision function.

**Wire formats** (backward compatible — old clients ignore the extra fields):

- SSE: `{ type: "error", error: string, code: AiErrorCode, retryable: boolean, retryAfterMs?: number }`
- JSON: `{ error: string, code: AiErrorCode, retryable: boolean, retryAfterMs?: number }` — and `/api/evaluate` passes through honest HTTP statuses (429/503) instead of a blanket 500.

## 4. Retry Policy

**Server does at most 2 silent attempts for student-facing interactive flows; everything beyond that is a visible, user-controlled retry.**

- `src/lib/ai/retry.ts` gains `export const INTERACTIVE_MAX_ATTEMPTS = 2;` and an optional `maxDelayMs` parameter on `waitBeforeRetry` / `withRetry`. Interactive callers pass ~4000ms so a `Retry-After: 30` cannot hold an SSE stream hostage.
- Adopted by: `/api/multimodal/turn` attemptLoop, `evaluateSubmission` → `generateStructured({ maxRetries: INTERACTIVE_MAX_ATTEMPTS })`, and the action handlers (§6).
- `DEFAULT_MAX_ATTEMPTS = 4` stays for teacher/background flows (`/api/generate-dynamic-questions`, `/api/generate-rubric-and-answer`) — they aren't latency-critical and already have a Retry button (`AssignmentResponseCore.tsx`).
- New SSE event `{ type: "retrying", attempt: number }` emitted from the attempt loops so `BotStatusPanel` can show "Reconnecting…" instead of silent dead air during the backoff.

```mermaid
sequenceDiagram
    participant S as Student (client)
    participant R as /api/multimodal/turn
    participant P as LLM Provider

    S->>R: POST turn (history, audio?)
    R->>R: upsert student chat_messages row (idempotent on id)
    R->>P: streamObject (attempt 1)
    P--xR: 429 rate limited
    R-->>S: SSE {type:"retrying", attempt:1}
    R->>R: waitBeforeRetry (capped ≤ 4s)
    R->>P: streamObject (attempt 2)
    P--xR: 429 rate limited
    R-->>S: SSE {type:"error", code:"RATE_LIMITED", retryable:true}
    S->>S: append failed-turn bubble with Retry button
    Note over S: student content + audio already persisted — nothing lost
    S->>R: POST turn again (same history snapshot, fresh assistant id)
    R->>R: student row upsert = no duplicate
    R->>P: streamObject
    P-->>R: speech + action stream
    R-->>S: normal turn events
```

## 5. Multimodal Turn Manual Retry

Turn lifecycle with the new failure states:

```mermaid
stateDiagram-v2
    [*] --> thinking: runAssistantTurn
    thinking --> reconnecting: retryable error, attempt < 2
    reconnecting --> thinking: next attempt
    thinking --> streaming: first speech/text byte
    thinking --> failed_retryable: terminal retryable error
    thinking --> failed_terminal: non-retryable error
    streaming --> done: stream completes
    streaming --> interrupted: user interruption (AbortError)
    streaming --> failed_retryable: stream dies mid-speech (partial committed)
    failed_retryable --> thinking: Retry button (fresh assistant id)
    failed_terminal --> [*]: guidance shown, no retry
    interrupted --> [*]: existing behavior unchanged
    done --> [*]
```

### Retry context

`MultimodalInputArea.tsx` keeps a ref (not React message state — audio base64 is large):

```ts
failedTurnRef: { history: ChatMessage[]; opts?: RunTurnOpts; error: ClassifiedAiError } | null
```

The non-abort branch of the `runAssistantTurn` catch block snapshots exactly the `(history, opts)` arguments it was called with, plus the classified error.

### Failed-turn bubble (replaces the banner for AI-turn failures)

- Append `{ id, role: "assistant", content: "", error: { code, message, retryable } }` to `messages` — new optional `error` field on the client `ChatMessage` interface.
- Rendered by `ContentBox` via a new `ChatTurnErrorBubble` composer (§8): retryable → message + Retry button; non-retryable → guidance text, no button.
- The `setError` banner and toast remain only for pre-turn failures (mic/transcription) and non-retryable errors.

### Retry handler

1. Remove the error bubble.
2. `void runAssistantTurn(failedTurnRef.history, failedTurnRef.opts)` — with `opts` adjusted per the audio decision table below.
3. `assistantMessageId` is minted fresh **inside** `runAssistantTurn`, so each retry gets a new assistant bubble id — never reuse the failed attempt's id (avoids FK/audio collisions).
4. Button disabled while `isAssistantTurnActive`; show attempt count ("Retry (2)"). No hard cap on manual retries; when `retryAfterMs` is present the button shows a countdown first.

### Audio vs transcript on retry

| State at failure | Retry sends |
|---|---|
| `user_transcript` already resolved (bubble no longer `status:"transcribing"`) | Plain-text history built from current `messagesRef` (matched by id); **drop** `latestUserAudio` — cheaper and deterministic. |
| Never resolved (direct-audio / dual-STT died early) | The stored `latestUserAudio` / original `transcriptCandidates` from `failedTurnRef` so the model re-resolves properly. |

### Duplicate student row avoidance

`insertChatMessage` (`src/lib/queries/chatMessages.ts`) becomes `.upsert(payload, { onConflict: "id" })`. Client-minted UUIDs make retries naturally idempotent, and update-on-conflict lets a retried dual-STT turn overwrite the fallback primary-candidate text with the properly resolved transcript. No schema migration. (Verify RLS permits students updating their own rows.)

### Partial-delivery failures (speech streamed, then died)

**Commit-partial + continue-as-new-turn — never regenerate.** The partial assistant text is already committed client-side (`commitAssistantTurnToMessages`) and persisted server-side ("persist even on interruption"). Deleting/superseding it would require DB mutations and audio cleanup. Instead:

- Detect via `assistantText.length > 0` in the catch.
- The retry sends history **including** the partial assistant bubble, plus a hidden context note (same mechanism as existing MCQ hidden notes): *"[Your previous reply was cut off by a technical error mid-sentence. Continue the conversation naturally; briefly restate anything essential.]"*
- The failed-turn bubble renders **after** the committed partial bubble.

This matches the app's existing interruption semantics exactly.

## 6. Action (Call 2) Retry

```mermaid
graph LR
    A[action_start SSE<br/>+ input payload] --> B[generateObject<br/>withRetry x2]
    B -->|success| C[persist chat_message_actions<br/>action_payload SSE → card ready]
    B -->|terminal failure| D[action_error SSE<br/>card stays, state: error]
    D -->|Retry button| E[POST /api/multimodal/action-retry]
    E -->|success| C
    E -->|failure| D
```

1. **Server-side silent retry:** wrap the `generateObject` calls in `mcq.ts`, `suggested-response.ts`, `display-content.ts` with `withRetry(fn, INTERACTIVE_MAX_ATTEMPTS)`. Actions run in parallel with TTS, so one retry is nearly free — speech masks the latency.
2. **Stop silently removing the card.** On `action_error` the client sets the card to `state: "error"` (already in the `PendingAction` type, `actionTypes.ts`) with the classified error, instead of filtering it out. `ActionCard.tsx` gains an error branch using the shared retry UI.
3. **Context transport:** the `action_start` SSE event gains `input: ActionInput` (the `resolvedAction` already in scope in the turn route). Client stores it as `PendingAction.input`. The payload is tiny (topic/difficulty/guidance) — no new persistence needed.
4. **New endpoint `POST /api/multimodal/action-retry`:**
   - Body: `{ assignmentId, submissionId, questionOrder, actionId, input, chatMessageId, language, supportLanguage? }`.
   - Plain JSON response — `generateObject` is non-streaming, nothing to stream.
   - Server: auth + integrity check mirroring the turn route; resolve the action's model via `getActionDefinition(kind).appFunctionKey` + `getCachedResolveModelConfig` — extract a shared `resolveActionModel()` helper deduping the turn route's inline version; rebuild recent conversation server-side from `chat_messages` (do **not** trust client-sent history); call `dispatchAction` with a collector `enqueue`; return `{ payload }` or classified error JSON.
   - Reuse the same `actionId`: `insertChatMessageAction` also becomes upsert-on-id (covers "persist succeeded but response lost" double-retry).
5. Client retry: card back to `state:"loading"` → POST → `state:"ready"` + payload on success, back to `state:"error"` on failure. Retry disabled while loading.

Keeping the card in error state keeps the tutor's spoken reference to it coherent, and the retry needs no turn re-run.

## 7. Evaluation / Feedback Retry

- **Server** (`/api/evaluate` catch): classify → return `{ error, code, retryable, retryAfterMs }` with status pass-through for 429/503. `evaluateSubmission` calls `generateStructured` with `maxRetries: INTERACTIVE_MAX_ATTEMPTS`.
- **Client** (`AssessmentShell.tsx`): new state `evaluationFailure: { answerText, error: ClassifiedAiError } | null`, set in the `handleEvaluate` catch (**keep the re-throw** so input areas retain their answer-preservation behavior). Render the shared retry card (`variant="block"`) near the evaluating area: retryable → "Evaluation failed — your answer is safe. [Retry]" with optional Retry-After countdown; non-retryable → guidance. Retry re-calls `handleEvaluate` with the same answer. Clear on retry start and on any new submission; disable while `isEvaluating`. Suppress the duplicate error toast for retryable errors (the card replaces it).
- **Decision: no failed-attempt record in submission tables.** `ai_invocations` (status `failed`, `retry_of`/`retry_index` chain) is already the audit trail; a failed evaluation stays invisible to grading.
- **Idempotency is natural:** `attempt_number` is recomputed from the DB max per request, and no `submission_attempts` row is written on failure ⇒ a retry reuses the same number; `submission_transcripts` upserts on `(submission_id, question_order, attempt_number)` are idempotent. Verify a unique index exists on `submission_attempts(submission_question_id, attempt_number)` and treat a conflict as "already evaluated — refetch attempts."

## 8. Shared UI Building Blocks

Per the project convention (ui primitive + feature composer, no inlined one-off UI):

- **Primitive** `src/components/ui/retry-error-card.tsx` — purely presentational:
  ```ts
  { message: string; detail?: string; retryable: boolean; retryLabel?: string;
    onRetry?: () => void; disabled?: boolean; countdownMs?: number;
    variant: "inline" | "block" }
  ```
  `inline` = compact bubble-sized row (multimodal chat); `block` = card (evaluate, action).
- **Hook** `src/lib/hooks/useRetryableRequest.ts` — thin standardization of `{ failure: ClassifiedAiError | null, fail(err), clear(), retry(), attemptCount }` around a wrapped async fn's last args. It deliberately does **not** own `runAssistantTurn`'s streaming lifecycle — that stays in the feature components. Over-abstracting the turn loop is the main scope risk of this project.
- **Composers:** `src/components/Shared/KonvoVoice/ChatTurnErrorBubble.tsx` (used by `ContentBox`), the error branch inside `ActionCard.tsx`, and direct `RetryErrorCard variant="block"` usage in `AssessmentShell`.

## 9. Decisions Made

| Question | Decision | Rationale |
|---|---|---|
| Silent server attempts | 2 for interactive flows (`INTERACTIVE_MAX_ATTEMPTS`), 4 stays for teacher/background | Covers transient blips (~1-4s); beyond that the user should be in control, not staring at "thinking" for 60s |
| Partial-delivery semantics | Commit partial + continue-as-new-turn with hidden note | Partial already persisted client- and server-side; regeneration would need DB/audio cleanup and risks double speech |
| Student-row dedup | PK upsert on client-minted id in `insertChatMessage` | Zero schema change; also lets a retried dual-STT turn correct the fallback transcript |
| Action context transport | `action_start` SSE carries `input`; kept in client state | Payload is tiny; avoids new persistence entirely |
| Action retry transport | Dedicated JSON endpoint, not SSE | `generateObject` is non-streaming — nothing to stream |
| Failed-evaluation persistence | None in submission tables | `ai_invocations` already audits failures; grading should never see failed attempts |
| Failed-turn persistence | None | Fully derivable from message order (trailing student row without assistant reply); see Future Work |
| Retry-button policy | Retryable + `UNKNOWN` → button; enumerated permanent codes → guidance | Retry is the safe default; only provably permanent failures suppress it |
| Audio vs transcript on retry | Transcript if resolved, stored audio/candidates if not | Cheaper + deterministic when possible; preserves dual-STT resolution when needed |
| Banner vs bubble | Bubble for AI-turn failures; banner/toast only pre-turn + non-retryable | Failure belongs in the conversation where the retry action lives |

## 10. Risks & Edge Cases

- **Interrupted SSE mid-speech:** partial assistant text is committed + persisted; retry is a *continuation* turn — never delete/regenerate the partial. The error bubble must render after the committed partial bubble.
- **Duplicate student rows:** today's plain insert on retry throws a duplicate-key error that is merely `console.error`'d; the upsert makes idempotency deliberate. Verify RLS allows upsert-update on own rows.
- **TTS session lifecycle:** each POST opens a fresh Cartesia/Sarvam WS — no reuse across retries. The client already releases turn UI + playback in the catch path; retry calls `playback.beginTurn` fresh. Stale audio-pump events from the failed turn are no-ops thanks to the existing `assistantTurnSeqRef` turn-id guards.
- **AbortController interplay:** a user *interruption* (AbortError) must **not** produce a retry bubble — the existing early-return abort branch stays untouched. Disable the Retry button until the previous turn's `finally` has run (`isAssistantTurnActive === false`).
- **Dual-STT retry semantics:** after failure the pending bubble is salvaged to the primary candidate and its audio persisted. Retry with the original `transcriptCandidates` (kept in `failedTurnRef`) lets the model re-resolve; the upsert then corrects the persisted row. Do **not** re-upload the audio.
- **Direct-audio deferred-audio map:** if `user_transcript` never arrived, the retry must re-send the stored base64 audio — verify the empty-content branch of the catch leaves the deferred-audio map entry intact (or re-add it from `failedTurnRef`).
- **Evaluate concurrent double-submit:** two tabs / double click can compute the same `attempt_number`; confirm the unique index and treat conflict as "already evaluated — refetch."
- **Action retry racing a new turn:** the action retry is independent (own endpoint, own card) so a new turn starting mid-retry is safe; just disable the card's retry while loading.
- **Retry-After honesty:** for a 429 with a long `Retry-After`, show a countdown on the button rather than letting users hammer retries.
- **SSE event ordering:** the turn route emits `{error}` then `{done}`; the client throws on `error` so later events go unread — fine, but the failed-bubble append must happen exactly once (the catch is the single site).

## 11. Implementation Phases

### Phase 1 — Error taxonomy + retry policy (server-only, no UI change)
- [ ] Create `src/lib/ai/errors.ts` (`AiErrorCode`, `ClassifiedAiError`, `classifyAiError`, `isRetryableCode`); export `getRetryAfterMs` from `src/lib/ai/retry.ts`.
- [ ] `src/lib/ai/retry.ts`: add `INTERACTIVE_MAX_ATTEMPTS = 2`; optional `maxDelayMs` on `waitBeforeRetry` / `withRetry`.
- [ ] `src/app/api/multimodal/turn/route.ts`: attemptLoop uses `INTERACTIVE_MAX_ATTEMPTS` + capped delay; error SSE gains `code`/`retryable`/`retryAfterMs`; emit `{type:"retrying", attempt}`.
- [ ] `src/app/api/evaluate/route.ts`: catch classifies and returns `{error, code, retryable, retryAfterMs}` with pass-through 429/503 status; `generateStructured` called with `maxRetries: INTERACTIVE_MAX_ATTEMPTS`.

### Phase 2 — Shared UI primitives
- [ ] `src/components/ui/retry-error-card.tsx` (inline + block variants, optional Retry-After countdown).
- [ ] `src/lib/hooks/useRetryableRequest.ts`.
- [ ] `src/components/Shared/KonvoVoice/ChatTurnErrorBubble.tsx`; extend client `ChatMessage` types (MultimodalInputArea, ContentBox props) with `error?: { code, message, retryable }`; `ContentBox.tsx` renders the bubble.

### Phase 3 — Multimodal turn retry
- [ ] `src/lib/queries/chatMessages.ts`: `insertChatMessage` → upsert on `id`.
- [ ] `MultimodalInputArea.tsx`: `failedTurnRef` snapshot in the non-abort catch branch; append failed bubble instead of banner for AI-turn failures; retry handler (rebuild history from current `messagesRef` by id, drop `latestUserAudio` when transcript resolved, hidden continue-note when speech was partially streamed); parse `code`/`retryable` off the error SSE (update `parseMultimodalTurnStream` types); handle `retrying` → `BotStatusPanel` "Reconnecting…".

### Phase 4 — Action retry
- [ ] `src/lib/multimodal/actions/{mcq,suggested-response,display-content}.ts`: wrap generation in `withRetry(fn, INTERACTIVE_MAX_ATTEMPTS)`.
- [ ] Turn route: `action_start` event carries `input`; extract shared `resolveActionModel()` helper.
- [ ] `src/lib/queries/chatMessageActions.ts`: upsert on id.
- [ ] New `src/app/api/multimodal/action-retry/route.ts` (auth, integrity check, rebuild recent messages from DB, collector enqueue, JSON response).
- [ ] Client: keep card on `action_error` with `state:"error"` + stored `input` (`actionTypes.ts` gains `input?: ActionInput`); `ActionCard.tsx` error branch with retry → POST → loading → ready/error.

### Phase 5 — Evaluate retry UI
- [ ] `AssessmentShell.tsx`: `evaluationFailure` state set in `handleEvaluate` catch (keep re-throw); render block `RetryErrorCard`; retry re-calls `handleEvaluate` with the same answer; clear on new submit/content change; suppress duplicate toast for retryable errors.

### Phase 6 — Docs + verification
- [ ] Run the verification pass (§12); cross-link this doc from `adding-multimodal-actions.md` (the `action_error` contract changes).

## 12. Verification

1. **Static:** `npx tsc --noEmit`, lint, build.
2. **Fault injection (dev-only):** temporarily throw a synthetic 429 (`{statusCode: 429, responseHeaders: {"retry-after": "2"}}`) from `createMultimodalTurnStream` / the MCQ handler / `generateStructured` for the first N calls. Verify: exactly 2 attempts in the `ai_invocations` retry chain (`retry_of`/`retry_index`), error SSE with `code: "RATE_LIMITED"`, failed bubble with working Retry, a single student `chat_messages` row (upsert), fresh assistant id per retry.
3. **Partial-stream failure:** throw after ~50 speech chars streamed → partial bubble commits + persists; retry continues with the hidden note; no duplicate assistant rows.
4. **Direct-audio + dual-STT:** fail before `user_transcript` → pending bubble survives, retry re-sends audio/candidates, transcript resolves, audio uploads exactly once.
5. **Action retry:** fail MCQ generation terminally → card shows error + Retry; retry endpoint returns payload; one `chat_message_actions` row for the id; answering works on the retried card.
6. **Evaluate:** fail evaluation → no `submission_attempts` row, answer intact in every input mode (static/voice/multimodal), retry card appears, retry produces the expected `attempt_number`, feedback renders.
7. **Non-retryable paths:** `AI_NOT_CONFIGURED` (503 + code) and capability mismatch (409) show guidance without a Retry button; integrity revocation still routes to `onIntegrityAccessRevoked`.
8. **Regression:** typed interruption mid-speech still commits the partial with its replay button and does **not** show a retry bubble.

## 13. Future Work

- **Page-refresh recovery:** once chat session rehydration exists, derive a "retry" offer on reload from a trailing `role='student'` row with no later assistant row for that attempt — no schema change needed. Out of scope now because `MultimodalInputArea` never rehydrates `messages` from `chat_messages` on mount.
- **Model-native retriable actions:** let the orchestrator re-issue a failed action in its next turn instead of (or in addition to) the manual card retry.
