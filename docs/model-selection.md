# Model Selection

This document explains how the app's AI catalog works, how models are resolved per request, and how to add a new function key.

---

## Overview

Every LLM-backed product feature is registered in `CATALOG_FUNCTIONS` (`src/lib/ai/catalog/data.ts`). At runtime, the app resolves which model (and whose API key) to use based on a three-level hierarchy: **platform → institution → class**. Child scopes override parent scopes; sub-functions fall back to their parent function's binding.

---

## Key concepts

### `AppFunctionKey`

Defined in `src/lib/ai/catalog/appFunctions.ts`. Each key identifies one AI-backed feature:

```
"text"                   — parent key for all text-generation features
"text.chat_tutoring"     — sub-function of "text"
"text.evaluation"
"text.dynamic_questions"
"text.rubric_generation"
"text.mcq_generation"
"text.transliteration"
"speech_to_text"
"text_to_speech"
```

Dot-notation keys (`text.something`) map to a parent key (`text`) and a sub-key (`something`). The `parseAppFunctionKey` function handles this split automatically.

### `CATALOG_FUNCTIONS`

Lives in `src/lib/ai/catalog/data.ts`. Each entry has:
- `key` — matches the `AppFunctionKey` (or the parent part)
- `label` / `description` — shown in the admin AI settings UI
- `requiredTasks` — e.g. `["text_generation"]`
- `subFunctions` (optional) — child features that share the parent's model unless overridden

### `CATALOG_MODELS`

Also in `data.ts`. Each model entry maps to a provider (Google, OpenAI, Cartesia, Sarvam), a `ModelClass`, and the tasks it supports.

---

## Resolution chain

When an API route calls `resolveCatalogConfigForRequest`, the chain is:

```
resolveCatalogConfigForRequest({ classDbId, appFunctionKey })
  │
  ├─ (with classDbId) getCachedResolveModelConfig
  │     └─ buildEffectiveRuntime (platform + institution + class secrets)
  │           └─ resolveFunctionBinding(runtime, parentKey, subKey)
  │                 ├─ check class scope for sub-key override
  │                 ├─ fall back to class scope parent key
  │                 ├─ fall back to institution scope
  │                 └─ fall back to platform scope
  │
  └─ (no classDbId) resolveCatalogModelConfigForPlatform
        └─ platform scope only
```

The resolved config includes the provider, model ID, API key, and reasoning options. Pass it to `getLanguageModel(config)` and optionally `providerOptionsForConfig(config)`.

**503 handling:** If no model is configured at any scope, `AiNotConfiguredError` is thrown. Use `catalogNotConfiguredResponse(error)` from `resolveCatalogConfig.ts` to return a well-formed 503.

---

## Adding a new function key

### 1. Add to `AppFunctionKey`

In `src/lib/ai/catalog/appFunctions.ts`, add the new key to the union:

```typescript
export type AppFunctionKey =
  | ...
  | "text.my_new_feature"   // ← add here
  | ...
```

If it's a sub-function of `text`, the existing `parseAppFunctionKey` dot-split handles it automatically — no other changes needed in that file.

### 2. Register in `CATALOG_FUNCTIONS`

In `src/lib/ai/catalog/data.ts`, add an entry to the appropriate function's `subFunctions` array (or as a top-level entry if it has its own model requirement):

```typescript
// In the "text" entry's subFunctions array:
{
  key: "my_new_feature",
  label: "My New Feature",
  description: "What it does.",
  consumers: ["Where it's used"],
},
```

This makes it visible in the admin AI settings UI and allows per-scope overrides.

### 3. Use in an API route

```typescript
import { getCachedResolveModelConfig } from "@/lib/ai/credentials/modelConfigCache";
import { catalogNotConfiguredResponse } from "@/lib/ai/credentials/resolveCatalogConfig";
import { getLanguageModel } from "@/lib/ai/provider";
import { providerOptionsForConfig } from "@/lib/ai/providerOptions";

let resolved;
try {
  resolved = await getCachedResolveModelConfig({
    classDbId,
    appFunctionKey: "text.my_new_feature",
  });
} catch (error) {
  const notConfigured = catalogNotConfiguredResponse(error);
  if (notConfigured) {
    return NextResponse.json(notConfigured.body, { status: notConfigured.status });
  }
  throw error;
}

const model = getLanguageModel(resolved.config);
const providerOptions = providerOptionsForConfig(resolved.config);
```

### 4. (Optional) Platform default

The platform must have the parent function (`text`) configured for any sub-function to resolve. Admins can optionally set a different model for the sub-function in the AI settings UI.

---

## Key files

| File | Role |
|---|---|
| `src/lib/ai/catalog/appFunctions.ts` | `AppFunctionKey` union + parse helpers |
| `src/lib/ai/catalog/data.ts` | `CATALOG_FUNCTIONS` and `CATALOG_MODELS` registry |
| `src/lib/ai/catalog/buildEffectiveRuntime.ts` | Merges platform + institution + class configs |
| `src/lib/ai/catalog/resolveRuntime.ts` | Resolves model config with API key for a given scope |
| `src/lib/ai/credentials/modelConfigCache.ts` | 5-minute TTL in-memory cache per server instance |
| `src/lib/ai/credentials/resolveCatalogConfig.ts` | `resolveCatalogConfigForRequest` entry point + 503 helper |
| `src/lib/ai/provider.ts` | `getLanguageModel(config)` → Vercel AI SDK `LanguageModelV3` |
| `src/lib/ai/providerOptions.ts` | `providerOptionsForConfig(config)` → reasoning/thinking options |
