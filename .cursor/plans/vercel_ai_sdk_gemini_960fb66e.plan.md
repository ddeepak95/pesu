---
name: Vercel AI SDK Gemini
overview: "Migrate Next.js LLM calls to Vercel AI SDK with src/lib/ai: Gemini default, optional OpenAI, ResolvedModelConfig for BYOK, structured outputs exclusively via JSON Schema and ai jsonSchema(), bounded retries, defer queues, separate routes, preserved SSE, voice unchanged, keep openai npm package. No Zod for this migration."
todos:
  - id: deps-config
    content: Add ai, @ai-sdk/google, @ai-sdk/openai (no zod); src/lib/ai config + provider (ResolvedModelConfig, getDefaultModelConfigFromEnv, getLanguageModel)
    status: completed
  - id: schemas-retry
    content: Centralize JSON Schema builders under src/lib/ai/schemas; wrap with jsonSchema() from ai; retry.ts; structured.ts + evaluateSubmission(model)
    status: completed
  - id: migrate-routes
    content: Migrate generate-rubric-and-answer, generate-dynamic-questions, evaluate, backgroundEvaluation to generateObject + jsonSchema
    status: completed
  - id: chat-sse
    content: chat-stream.ts — streamText, end_conversation tool defined with JSON Schema / jsonSchema, retry, SSE mapping unchanged
    status: completed
  - id: verify
    content: npm run build; smoke-test all flows; AI_PROVIDER=google and openai
    status: completed
isProject: false
---

# Next.js LLM migration: Vercel AI SDK + modular `src/lib/ai`

## Decision: JSON Schema for structured data (no Zod)

**All structured LLM outputs and tool parameter schemas use [JSON Schema](https://json-schema.org/)**, passed to the AI SDK via **`jsonSchema()`** from **`ai`** and **`generateObject` / `streamText` tools** as documented in [AI SDK: jsonSchema](https://sdk.vercel.ai/docs/reference/ai-sdk-core/json-schema).

| Rationale        | Detail                                                                                                                     |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Continuity**   | The app already uses JSON Schema (e.g. OpenAI `response_format.json_schema`, `buildGeneratedQuestionsJsonSchema`).         |
| **Portability**  | Same format across providers and docs; easy to store or version as JSON.                                                   |
| **Dependencies** | **Do not add `zod`** for this migration — avoids a second schema system and keeps the stack aligned with JSON Schema only. |

TypeScript types for parsed objects: use the **generic** on `jsonSchema<T>(...)` and/or narrow with **`satisfies`** / explicit interfaces next to schema constants.

## Summary

1. **Vercel AI SDK** (`ai`, `@ai-sdk/google`, `@ai-sdk/openai`); **no `zod`** dependency for LLM structured outputs.
2. **Default provider:** **Gemini**; **optional:** **OpenAI** via `AI_PROVIDER` (`google` \| `openai`, default `google`).
3. **`src/lib/ai`:** `ResolvedModelConfig`, model factory, **JSON Schema modules** + **`jsonSchema()`**, **retry**, evaluation helper, chat→SSE.
4. **Separate Route Handlers** per feature; thin routes calling `src/lib/ai`.
5. **`getLanguageModel(config)`** has no `process.env`; **BYOK** reuses the same config type later.
6. **Retries** for rate limits now; **no** distributed queue until product needs it.
7. **Server modules only**; preserve HTTP/SSE contracts.
8. **Voice:** out of scope — Pipecat / [`pesu-server`](pesu-server/bot.py) unchanged.
9. **`openai` npm package** may remain in `package.json`.

## Goals

| Goal                               | Detail                                                                                                                                                    |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Replace OpenAI SDK in these routes | `generateObject` / `streamText` via AI SDK.                                                                                                               |
| Structured outputs                 | **`jsonSchema()`** + shared JSON Schema definitions (evaluation, rubric, dynamic questions).                                                              |
| Streaming + tool                   | `streamText` + **`end_conversation`** tool (JSON Schema); SSE unchanged ([`sseParser.ts`](src/lib/sseParser.ts)).                                         |
| DRY evaluation                     | **`evaluateSubmission`** shared by [`evaluate/route.ts`](src/app/api/evaluate/route.ts) and [`backgroundEvaluation.ts`](src/lib/backgroundEvaluation.ts). |
| BYOK-ready                         | **`getLanguageModel(ResolvedModelConfig)`**; env only in **`getDefaultModelConfigFromEnv()`**.                                                            |
| Resilience                         | **`retry.ts`**: backoff + jitter, **Retry-After**, capped attempts.                                                                                       |

## Non-goals

- Introducing **Zod** for LLM or route validation in this migration.
- Pipecat / Daily / Python bot changes.
- BYOK UI / encrypted key storage (future).
- Removing **`openai`** from `package.json`.
- Extra user-facing markdown docs unless requested.
- Distributed job queue for LLM fairness — defer.

## Current state → target

| Area            | Files                                                                       | Today → Target                                                                       |
| --------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Structured JSON | generate-rubric, generate-dynamic-questions, evaluate, backgroundEvaluation | OpenAI SDK + JSON schema → **`generateObject({ schema: jsonSchema(...) })`** + retry |
| Chat + SSE      | [`chat-assessment/route.ts`](src/app/api/chat-assessment/route.ts)          | Manual OpenAI stream → **`chat-stream.ts`** + retry                                  |

## Configuration (`ResolvedModelConfig`)

At least: `provider: 'google' | 'openai'`, `apiKey: string`, `modelId: string`.

- **`getDefaultModelConfigFromEnv()`** — `config.ts`; reads `AI_PROVIDER`, model overrides, API keys; clear errors if the active provider’s key is missing.
- **`getLanguageModel(config)`** — `provider.ts`; **no** `process.env`.

## Architecture

```mermaid
flowchart TB
  subgraph routes [Route handlers]
    A[generate-rubric-and-answer]
    B[generate-dynamic-questions]
    C[evaluate]
    D[chat-assessment]
  end
  env[getDefaultModelConfigFromEnv]
  factory[getLanguageModel]
  retry[withRetry]
  lib[structured evaluateSubmission chat-stream]
  routes --> env
  env --> factory
  factory --> lib
  lib --> retry
  retry --> Google[@ai-sdk/google]
  retry --> OpenAI[@ai-sdk/openai]
```

**NPM:** `ai`, `@ai-sdk/google`, `@ai-sdk/openai` only (for this feature set).

## `src/lib/ai` layout

| Module                      | Responsibility                                                                                                                                                                      |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`config.ts`**             | `ResolvedModelConfig`, `getDefaultModelConfigFromEnv()`.                                                                                                                            |
| **`provider.ts`**           | `getLanguageModel(config)`.                                                                                                                                                         |
| **`retry.ts`**              | Retryable errors (429, 503, …), **Retry-After**, caps.                                                                                                                              |
| **`schemas/`**              | JSON Schema **as const** objects + builders (e.g. `buildGeneratedQuestionsJsonSchema(n)`); thin **`wrapJsonSchema(schema)`** helpers that return `jsonSchema<T>(schema)` if useful. |
| **`structured.ts`**         | `generateObject` defaults + compose with **retry**.                                                                                                                                 |
| **`evaluateSubmission.ts`** | User/system messages + `generateObject` + post-parse clamping.                                                                                                                      |
| **`chat-stream.ts`**        | `streamText`, tool definitions, retry, SSE encoding.                                                                                                                                |

## Route-level work

| Route                                                | Work                                                                    |
| ---------------------------------------------------- | ----------------------------------------------------------------------- |
| `POST /api/generate-rubric-and-answer`               | `generateObject` + rubric JSON Schema; same JSON body.                  |
| `POST /api/generate-dynamic-questions`               | Dynamic JSON Schema for `n` questions; unchanged file + Supabase logic. |
| `POST /api/evaluate` + **`runBackgroundEvaluation`** | Shared evaluator; integrity, `after()`, DB updates.                     |
| `POST /api/chat-assessment`                          | **`chat-stream.ts`**; identical SSE contract.                           |

## Environment (Next.js)

| Variable                                           | Role                           |
| -------------------------------------------------- | ------------------------------ |
| `AI_PROVIDER`                                      | `google` (default) or `openai` |
| `GEMINI_MODEL` / `OPENAI_MODEL`                    | Optional overrides             |
| `GOOGLE_GENERATIVE_AI_API_KEY` or `GEMINI_API_KEY` | Google                         |
| `OPENAI_API_KEY`                                   | When `AI_PROVIDER=openai`      |

`pesu-server` env is separate.

## Provider rate limits and queuing

| Layer     | Decision                                                    |
| --------- | ----------------------------------------------------------- |
| **Now**   | In-process **retries** in **`retry.ts`**.                   |
| **Later** | External queue only for fairness / bulk / throughput needs. |
| **Note**  | `after()` is async fire-and-forget, not a durable queue.    |

## Verification

- `npm run build`.
- Rubric AI, dynamic questions, evaluate (sync + background), chat + **`end_conversation`**.
- **`AI_PROVIDER`:** `google` and `openai` (streaming + tools).

## BYOK (future)

Store encrypted keys; resolve **`ResolvedModelConfig`** per tenant → **`getLanguageModel`**.
