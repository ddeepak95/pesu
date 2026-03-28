import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { assertSubmissionNotIntegrityLocked } from "@/lib/integrity/assertSubmissionNotIntegrityLocked";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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
  /** Fully-interpolated system prompt (constructed by the client). */
  system_prompt: string;
  /** Optional first-turn greeting instruction. */
  greeting?: string;
}

function sseEvent(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

const END_CONVERSATION_TOOL: OpenAI.ChatCompletionTool = {
  type: "function",
  function: {
    name: "end_conversation",
    description:
      "End the conversation gracefully. Call this when: (1) the student explicitly refuses to answer (e.g., says 'I refuse', 'I don't want to', 'I can't answer'), or (2) the student has answered the question and you're satisfied with their response covering the expected answers. Always provide a polite ending message thanking the student.",
    parameters: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          enum: ["refusal", "thorough"],
          description:
            "Use 'refusal' if the student explicitly refuses to answer. Use 'thorough' if the student has thoroughly answered the question.",
        },
        message: {
          type: "string",
          description:
            "A polite ending message in the conversation language, thanking the student.",
        },
      },
      required: ["reason", "message"],
    },
  },
};

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

    console.log("[chat-assessment] Request received:", {
      assignmentId,
      submissionId,
      questionOrder,
      attemptNumber,
      messageCount: messages.length,
      systemPromptLength: systemPrompt.length,
      hasGreeting: !!greeting,
    });

    if (submissionId) {
      const supabase = await createServerSupabaseClient();
      const integrityBlock = await assertSubmissionNotIntegrityLocked(
        supabase,
        submissionId,
      );
      if (integrityBlock) {
        return integrityBlock;
      }
    }

    // Build chat messages — system prompt is used as-is from the client
    const chatMessages: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system" as const, content: systemPrompt },
    ];

    if (greeting && messages.length === 0) {
      chatMessages.push({
        role: "system" as const,
        content: `[Instructions for your first response]: ${greeting}`,
      });
    }

    chatMessages.push(
      ...messages.map((message) => ({
        role:
          message.role === "student"
            ? ("user" as const)
            : ("assistant" as const),
        content: message.content,
      })),
    );

    console.log("[chat-assessment] Chat messages:", chatMessages);

    // Log the latest student message
    const supabase = await createServerSupabaseClient();
    try {
      const studentMessages = messages.filter(
        (m) => m.role === "student" && m.content?.trim(),
      );
      const latestStudent = studentMessages[studentMessages.length - 1];

      if (latestStudent) {
        await supabase.from("chat_messages").insert({
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

    console.log(
      "[chat-assessment] Total chat messages being sent to OpenAI:",
      chatMessages.length,
    );

    const stream = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: chatMessages,
      tools: [END_CONVERSATION_TOOL],
      stream: true,
    });

    const encoder = new TextEncoder();
    const readableStream = new ReadableStream({
      async start(controller) {
        let fullReply = "";
        let toolCallName = "";
        let toolCallArguments = "";

        try {
          for await (const chunk of stream) {
            const choice = chunk.choices[0];
            if (!choice) continue;

            const delta = choice.delta;

            if (delta.content) {
              fullReply += delta.content;
              controller.enqueue(
                encoder.encode(
                  sseEvent({ type: "text-delta", content: delta.content }),
                ),
              );
            }

            if (delta.tool_calls) {
              for (const toolCall of delta.tool_calls) {
                if (toolCall.function?.name) {
                  toolCallName = toolCall.function.name;
                }
                if (toolCall.function?.arguments) {
                  toolCallArguments += toolCall.function.arguments;
                }
              }
            }
          }

          if (toolCallName === "end_conversation" && toolCallArguments) {
            console.log(
              "[chat-assessment] Tool call detected: end_conversation, raw args:",
              toolCallArguments,
            );
            try {
              const args = JSON.parse(toolCallArguments) as {
                reason: string;
                message: string;
              };

              if (args.message) {
                fullReply += args.message;
                controller.enqueue(
                  encoder.encode(
                    sseEvent({
                      type: "text-delta",
                      content: args.message,
                    }),
                  ),
                );
              }

              controller.enqueue(
                encoder.encode(
                  sseEvent({
                    type: "end_conversation",
                    reason: args.reason || "thorough",
                  }),
                ),
              );
            } catch (parseError) {
              console.error(
                "Failed to parse end_conversation arguments:",
                parseError,
                "Raw:",
                toolCallArguments,
              );
            }
          }

          controller.enqueue(encoder.encode(sseEvent({ type: "done" })));

          console.log("[chat-assessment] Stream complete:", {
            fullReplyLength: fullReply.length,
            hadToolCall: !!toolCallName,
            toolCallName: toolCallName || "(none)",
          });

          if (fullReply.trim()) {
            try {
              await supabase.from("chat_messages").insert({
                submission_id: submissionId ?? null,
                assignment_id: assignmentId,
                question_order: questionOrder,
                role: "assistant",
                content: fullReply,
                attempt_number: attemptNumber ?? null,
              });
            } catch (error) {
              console.error("Failed to log assistant chat message:", error);
            }
          }

          controller.close();
        } catch (error) {
          try {
            controller.enqueue(
              encoder.encode(
                sseEvent({
                  type: "error",
                  error:
                    error instanceof Error
                      ? error.message
                      : "Unknown streaming error",
                }),
              ),
            );
          } catch {
            // Controller may already be errored
          }
          controller.error(error);
        }
      },
    });

    return new Response(readableStream, {
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
