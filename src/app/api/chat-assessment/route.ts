import { after, NextRequest, NextResponse } from "next/server";
import { getClassDbIdForAssignment } from "@/lib/assignments/assignmentClassCache";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  formatReasoningForConfig,
  providerOptionsForConfig,
} from "@/lib/ai/providerOptions";
import { getLanguageModel } from "@/lib/ai/provider";
import { getCachedResolveModelConfig } from "@/lib/ai/credentials/modelConfigCache";
import {
  aiKeySourceLogLabel,
  AiNotConfiguredError,
} from "@/lib/ai/credentials/resolve";
import { createChatStream, resolveChatStreamCall } from "@/lib/ai/chat-stream";
import { insertChatMessage } from "@/lib/queries/chatMessages";
import {
  DEFAULT_MAX_ATTEMPTS,
  isRetryableProviderError,
  waitBeforeRetry,
} from "@/lib/ai/retry";
import { modelMetaFromResolved } from "@/lib/ai/logging/types";
import {
  completeAiInvocation,
  failAiInvocation,
  linkInvocationToChatMessage,
  startAiInvocation,
  usageFromAiSdkResult,
} from "@/lib/ai/logging/recordInvocation";
import {
  buildLoggedSdkResponse,
  buildLoggedStreamTextRequest,
} from "@/lib/ai/logging/serialize";

interface ChatAssessmentMessage {
  role: "student" | "assistant";
  content: string;
}

interface ChatAssessmentRequestBody {
  assignmentId: string;
  submissionId?: string;
  questionOrder: number;
  messages: ChatAssessmentMessage[];
  attemptNumber?: number;
  system_prompt: string;
  greeting?: string;
}

function sseEvent(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function POST(request: NextRequest) {
  try {
    const body: ChatAssessmentRequestBody = await request.json();

    const {
      assignmentId,
      submissionId,
      questionOrder,
      messages,
      attemptNumber,
      system_prompt: systemPrompt,
      greeting,
    } = body;

    if (
      !assignmentId ||
      questionOrder === undefined ||
      !messages ||
      !systemPrompt
    ) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    const supabase = await createServerSupabaseClient();

    const classDbId = await getClassDbIdForAssignment(supabase, assignmentId);
    if (!classDbId) {
      return NextResponse.json(
        { error: "Assignment not found" },
        { status: 404 },
      );
    }

    let resolved;
    try {
      resolved = await getCachedResolveModelConfig({
        classDbId,
        appFunctionKey: "text.chat_tutoring",
      });
    } catch (error) {
      if (error instanceof AiNotConfiguredError) {
        return NextResponse.json(
          {
            error: error.message,
            code: error.code,
          },
          { status: 503 },
        );
      }
      throw error;
    }

    const { config, keySource } = resolved;
    console.log("[chat-assessment]", {
      provider: config.provider,
      modelId: config.modelId,
      keySource,
      label: aiKeySourceLogLabel(keySource),
      reasoning: formatReasoningForConfig(config),
    });
    const model = getLanguageModel(config);
    const providerOptions = providerOptionsForConfig(config);

    const aiMetadata = {
      aiKeySource: keySource,
      aiProvider: config.provider,
      aiModelId: config.modelId,
    };

    const invocationModel = modelMetaFromResolved(config, keySource);

    // Log latest student message
    try {
      const studentMessages = messages.filter(
        (m) => m.role === "student" && m.content?.trim(),
      );
      const latestStudent = studentMessages[studentMessages.length - 1];
      if (latestStudent) {
        await insertChatMessage(supabase, {
          submission_id: submissionId ?? null,
          assignment_id: assignmentId,
          question_order: questionOrder,
          role: "student",
          content: latestStudent.content,
          attempt_number: attemptNumber ?? null,
        });
      }
    } catch (error) {
      console.error("Failed to log chat message(s):", error);
    }

    const sdkMessages = messages.map((msg) => ({
      role: msg.role === "student" ? ("user" as const) : ("assistant" as const),
      content: msg.content,
    }));

    const encoder = new TextEncoder();

    const readable = new ReadableStream({
      async start(controller) {
        let fullReply = "";
        let endConversationReason: string | null = null;
        let firstInvocationId: string | null = null;
        let winningInvocationId: string | null = null;
        let winningStartedAtMs: number | undefined;
        let lastStreamResult: ReturnType<typeof createChatStream> | null = null;

        const streamCallBase = {
          systemPrompt,
          greeting,
          messages: sdkMessages,
          providerOptions,
        };

        attemptLoop: for (let attempt = 0; attempt < DEFAULT_MAX_ATTEMPTS; attempt++) {
          const startedAtMs = Date.now();
          const resolvedCall = resolveChatStreamCall(streamCallBase);
          const invocationId = await startAiInvocation({
            appFunctionKey: "text.chat_tutoring",
            classId: classDbId,
            assignmentId,
            submissionId: submissionId ?? null,
            questionOrder,
            attemptNumber: attemptNumber ?? null,
            model: invocationModel,
            sdkRequest: buildLoggedStreamTextRequest({
              system: resolvedCall.system,
              messages: resolvedCall.messages,
              tools: resolvedCall.tools,
              toolChoice: resolvedCall.toolChoice,
              stopWhen: resolvedCall.stopWhen,
              providerOptions: resolvedCall.providerOptions,
            }),
            retryOf: firstInvocationId,
            retryIndex: attempt,
          });
          if (invocationId && attempt === 0) {
            firstInvocationId = invocationId;
          }

          const result = createChatStream({
            model,
            ...streamCallBase,
          });
          lastStreamResult = result;
          let deliveredToClient = false;

          try {
            for await (const part of result.fullStream) {
              switch (part.type) {
                case "text-delta": {
                  fullReply += part.text;
                  deliveredToClient = true;
                  controller.enqueue(
                    encoder.encode(
                      sseEvent({ type: "text-delta", content: part.text }),
                    ),
                  );
                  break;
                }
                case "tool-call": {
                  if (part.toolName === "end_conversation") {
                    const input = part.input as {
                      reason?: string;
                      message?: string;
                    };
                    const reason =
                      input.reason === "refusal" ? "refusal" : "thorough";
                    endConversationReason = reason;
                    const message = input.message ?? "";

                    if (message) {
                      fullReply += message;
                      deliveredToClient = true;
                      controller.enqueue(
                        encoder.encode(
                          sseEvent({ type: "text-delta", content: message }),
                        ),
                      );
                    }
                    deliveredToClient = true;
                    controller.enqueue(
                      encoder.encode(
                        sseEvent({ type: "end_conversation", reason }),
                      ),
                    );
                  }
                  break;
                }
                case "error": {
                  const streamErr = part.error;
                  if (
                    !deliveredToClient &&
                    isRetryableProviderError(streamErr) &&
                    attempt < DEFAULT_MAX_ATTEMPTS - 1
                  ) {
                    if (invocationId) {
                      after(() =>
                        failAiInvocation(invocationId, streamErr, startedAtMs),
                      );
                    }
                    await waitBeforeRetry(streamErr, attempt);
                    continue attemptLoop;
                  }
                  const errMsg =
                    streamErr instanceof Error
                      ? streamErr.message
                      : "Unknown streaming error";
                  if (invocationId) {
                    after(() =>
                      failAiInvocation(invocationId, streamErr, startedAtMs),
                    );
                  }
                  deliveredToClient = true;
                  controller.enqueue(
                    encoder.encode(sseEvent({ type: "error", error: errMsg })),
                  );
                  break;
                }
                default:
                  break;
              }
            }
            if (invocationId) {
              winningInvocationId = invocationId;
              winningStartedAtMs = startedAtMs;
            }
            break attemptLoop;
          } catch (err) {
            if (
              !deliveredToClient &&
              isRetryableProviderError(err) &&
              attempt < DEFAULT_MAX_ATTEMPTS - 1
            ) {
              if (invocationId) {
                after(() => failAiInvocation(invocationId, err, startedAtMs));
              }
              await waitBeforeRetry(err, attempt);
              continue attemptLoop;
            }
            const errMsg =
              err instanceof Error ? err.message : "Unknown streaming error";
            if (invocationId) {
              after(() => failAiInvocation(invocationId, err, startedAtMs));
            }
            if (!deliveredToClient) {
              controller.enqueue(
                encoder.encode(sseEvent({ type: "error", error: errMsg })),
              );
            }
            break attemptLoop;
          }
        }

        controller.enqueue(encoder.encode(sseEvent({ type: "done" })));

        if (fullReply.trim()) {
          try {
            const chatMessageId = await insertChatMessage(supabase, {
              submission_id: submissionId ?? null,
              assignment_id: assignmentId,
              question_order: questionOrder,
              role: "assistant",
              content: fullReply,
              attempt_number: attemptNumber ?? null,
              aiMetadata,
              aiInvocationId: winningInvocationId,
            });

            if (winningInvocationId) {
              const invId = winningInvocationId;
              const startedAt = winningStartedAtMs;
              const streamResult = lastStreamResult;

              after(async () => {
                try {
                  if (chatMessageId) {
                    await linkInvocationToChatMessage(invId, chatMessageId);
                  }
                  const sdkResponse = streamResult
                    ? await buildLoggedSdkResponse(streamResult)
                    : null;
                  const usage = streamResult
                    ? await usageFromAiSdkResult(streamResult)
                    : null;
                  const finishReason =
                    sdkResponse &&
                    typeof sdkResponse === "object" &&
                    sdkResponse !== null &&
                    "finishReason" in sdkResponse
                      ? (sdkResponse.finishReason as string | null)
                      : null;
                  await completeAiInvocation(
                    invId,
                    {
                      sdkResponse: sdkResponse ?? {
                        text: fullReply,
                        endConversationReason,
                      },
                      usage,
                      finishReason,
                    },
                    startedAt,
                  );
                } catch (logErr) {
                  console.error(
                    "[chat-assessment] AI invocation logging failed:",
                    logErr,
                  );
                }
              });
            }
          } catch (error) {
            console.error("Failed to log assistant chat message:", error);
          }
        }

        controller.close();
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Chat-assessment API error:", error);
    return NextResponse.json(
      {
        error: "Failed to generate chat reply",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
