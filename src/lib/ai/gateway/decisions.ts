import "server-only";
import { requestDecisions } from "./decisionsTransport";
import { resolveMeteredContext, type AiCallContext } from "./model";
import { startAiInvocation, completeAiInvocation, scheduleFailAiInvocation } from "@/lib/ai/logging/recordInvocation";

export interface DecisionQuestion {
  type: "choice";
  name: string;
  instructions: string;
  choices: Array<{ value: string; description: string }>;
}

export async function resolveMeteredDecisions(context: AiCallContext) {
  const appFunctionKey = "decisions.chatbot_image_matching" as const;
  const { config, keySource, institutionId, walletId } = await resolveMeteredContext({ appFunctionKey, context });
  if (config.provider !== "openai" || config.modelId !== "gpt-6-luna-decisions")
    throw new Error("Configure OpenAI GPT-6 Luna (Decisions) for chatbot image matching.");
  return {
    async decide(input: string, questions: DecisionQuestion[], timeoutMs: number) {
      const started = Date.now();
      const body = { model: "gpt-6-luna", input, questions,
        // Explicit mode without breakpoints disables implicit cache writes.
        prompt_cache_options: { mode: "explicit" } };
      const invocationId = await startAiInvocation({
        appFunctionKey, usageType: "decisions", institutionId, walletId,
        classId: context.classDbId, userId: context.userId,
        relatedEntityType: context.relatedEntity?.type, relatedEntityId: context.relatedEntity?.id,
        model: { provider: config.provider, modelId: config.modelId, keySource }, sdkRequest: body,
      });
      if (!invocationId) throw new Error("Could not record Decisions invocation");
      try {
        const remaining = timeoutMs - (Date.now() - started);
        const { result, requestId } = await requestDecisions(config.apiKey, body, remaining);
        if (invocationId) await completeAiInvocation(invocationId, {
          sdkResponse: result, providerRequestId: requestId,
          usage: { promptTokens: result.usage?.input_tokens, completionTokens: 0 },
          tokenDetails: { cachedInputTokens: result.usage?.input_tokens_details?.cached_tokens ?? 0 },
          finishReason: "stop",
        }, started);
        return { answers: result.answers as unknown, invocationId };
      } catch (error) {
        if (invocationId) scheduleFailAiInvocation(invocationId, error, started);
        throw error;
      }
    },
  };
}
