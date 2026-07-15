/**
 * The AI gateway — dev-docs/ai-usage-metering-plan.md §7.
 *
 * `src/lib/ai/gateway/` is the only place that holds provider credentials,
 * constructs provider clients, executes calls, and meters them. Everything
 * else in the app obtains a **metered handle** (MeteredTextModel /
 * MeteredSttClient / MeteredTtsClient) from resolveMeteredModel /
 * resolveMeteredSpeech below — never a raw model, raw provider client, or
 * raw API key. This file is the pinned public surface (§7.1); gateway
 * internals (model.ts, speech.ts, structured.ts, turnStream.ts) are not
 * meant to be imported directly from outside this directory.
 */

export type { AiCallContext, MeteredTextModel } from "./model";
export { resolveMeteredModel } from "./model";

export type { MeteredSttClient, MeteredTtsClient, MeteredTtsSession } from "./speech";
export { resolveMeteredSpeech, resolveSpeechKeySource } from "./speech";

export type { AiRequestContext } from "./context";
export { runWithAiContext, getAiContext, AiContextMissingError } from "./context";

// Pure schema/prompt-building helpers for the multimodal turn route — no `ai`
// package import, safe to expose alongside MeteredTextModel.streamTurn.
export {
  TURN_SCHEMA_NAME,
  buildTurnSchema,
  resolveMultimodalTurnCall,
} from "./turnStream";
export type {
  MultimodalTurnStreamOptions,
  ResolvedMultimodalTurnCall,
  TurnSchema,
} from "./turnStream";
