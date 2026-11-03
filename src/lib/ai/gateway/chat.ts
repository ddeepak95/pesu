import "server-only";

import { streamText } from "ai";
import {
  google,
  type GoogleGenerativeAIProviderMetadata,
} from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import type {
  LanguageModelV3,
  SharedV3ProviderOptions,
} from "@ai-sdk/provider";
import {
  startAiInvocation,
  completeAiInvocation,
  failAiInvocation,
  tokenDetailsFromSdkUsage,
} from "@/lib/ai/logging/recordInvocation";
import {
  buildLoggedGenerateTextRequest,
  buildLoggedSdkResponse,
} from "@/lib/ai/logging/serialize";
import type { StartAiInvocationInput } from "@/lib/ai/logging/types";
import type { ChatbotSource } from "@/types/chatbot";

export interface ChatGenerationOptions {
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  onText?: (text: string) => void;
  webSearch: boolean;
  imageSearch: boolean;
}

export interface ChatGenerationResult {
  text: string;
  sources: ChatbotSource[];
  searchEntryPoint: string | null;
  invocationId: string | null;
}

export async function generateChatInternal(
  input: ChatGenerationOptions & {
    model: LanguageModelV3;
    providerOptions?: SharedV3ProviderOptions;
    invocation: Omit<StartAiInvocationInput, "sdkRequest">;
  },
): Promise<ChatGenerationResult> {
  const { model, providerOptions, messages, invocation } = input;
  const provider = invocation.model.provider;
  const search = input.webSearch || input.imageSearch;
  if (search && provider !== "google" && provider !== "openai") {
    throw new Error(
      "The class model does not support provider-native search. Disable search or ask an administrator to change the model.",
    );
  }
  const started = Date.now();
  const invocationId = await startAiInvocation({
    ...invocation,
    sdkRequest: {
      ...buildLoggedGenerateTextRequest({ messages, providerOptions }),
      tools: { webSearch: input.webSearch, imageSearch: input.imageSearch },
    },
  });
  try {
    const stream = streamText({
      model,
      messages,
      providerOptions,
      // Image links use the same native web-search tool. This does not request
      // image generation or assume that the provider exposes an image-results API.
      tools: search
        ? provider === "google"
          ? { google_search: google.tools.googleSearch({}) }
          : { web_search: openai.tools.webSearch({}) }
        : undefined,
      abortSignal: AbortSignal.timeout(90000),
      maxRetries: 0,
    });
    for await (const part of stream.fullStream) {
      if (part.type === "error") throw part.error;
      if (part.type === "abort")
        throw new Error("The reply was interrupted. Please try again.");
      if (part.type === "text-delta") input.onText?.(part.text);
    }
    const result = {
      text: await stream.text,
      sources: await stream.sources,
      providerMetadata: await stream.providerMetadata,
      totalUsage: await stream.totalUsage,
      usage: await stream.usage,
      finishReason: await stream.finishReason,
      response: await stream.response,
      steps: await stream.steps,
      warnings: await stream.warnings,
    };
    if (invocationId) {
      await completeAiInvocation(
        invocationId,
        {
          sdkResponse: await buildLoggedSdkResponse(result),
          usage: {
            promptTokens: result.totalUsage.inputTokens,
            completionTokens: result.totalUsage.outputTokens,
            totalTokens: result.totalUsage.totalTokens,
          },
          tokenDetails: tokenDetailsFromSdkUsage(
            result.totalUsage,
            result.providerMetadata,
          ),
          finishReason: result.finishReason,
        },
        started,
      );
    }
    if (!result.text.trim())
      throw new Error(
        "The model returned no text. Try again or disable unsupported search tools.",
      );
    const metadata = result.providerMetadata?.google as
      GoogleGenerativeAIProviderMetadata | undefined;
    return {
      text: result.text,
      sources: result.sources.flatMap((source) =>
        source.sourceType === "url" && /^https?:\/\//i.test(source.url)
          ? [{ url: source.url, title: source.title || source.url }]
          : [],
      ),
      searchEntryPoint:
        metadata?.groundingMetadata?.searchEntryPoint?.renderedContent ?? null,
      invocationId,
    };
  } catch (error) {
    if (invocationId) await failAiInvocation(invocationId, error, started);
    if (
      search &&
      error &&
      typeof error === "object" &&
      "statusCode" in error &&
      error.statusCode === 400
    ) {
      throw new Error(
        "The class model rejected the enabled search tools. Disable search or ask an administrator to select a compatible model.",
      );
    }
    throw error;
  }
}
