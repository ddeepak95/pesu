import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { assertSubmissionNotIntegrityLocked } from "@/lib/integrity/assertSubmissionNotIntegrityLocked";
import { getDefaultModelConfigFromEnv } from "@/lib/ai/config";
import { getLanguageModel } from "@/lib/ai/provider";
import { runChatStream } from "@/lib/ai/chat-stream";

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

    const model = getLanguageModel(getDefaultModelConfigFromEnv());

    // Convert student/assistant roles to user/assistant for the AI SDK
    const sdkMessages = messages.map((msg) => ({
      role: msg.role === "student" ? ("user" as const) : ("assistant" as const),
      content: msg.content,
    }));

    const encoder = new TextEncoder();
    let fullReply = "";

    const readableStream = new ReadableStream({
      async start(controller) {
        await runChatStream({
          model,
          systemPrompt,
          greeting,
          messages: sdkMessages,
          callbacks: {
            onTextDelta(chunk) {
              fullReply += chunk;
              controller.enqueue(
                encoder.encode(
                  sseEvent({ type: "text-delta", content: chunk }),
                ),
              );
            },
            onEndConversation(reason) {
              controller.enqueue(
                encoder.encode(
                  sseEvent({ type: "end_conversation", reason }),
                ),
              );
            },
            onDone() {
              controller.enqueue(encoder.encode(sseEvent({ type: "done" })));

              if (fullReply.trim()) {
                supabase
                  .from("chat_messages")
                  .insert({
                    submission_id: submissionId ?? null,
                    assignment_id: assignmentId,
                    question_order: questionOrder,
                    role: "assistant",
                    content: fullReply,
                    attempt_number: attemptNumber ?? null,
                  })
                  .then(({ error }) => {
                    if (error) {
                      console.error(
                        "Failed to log assistant chat message:",
                        error,
                      );
                    }
                  });
              }

              controller.close();
            },
            onError(message) {
              try {
                controller.enqueue(
                  encoder.encode(
                    sseEvent({ type: "error", error: message }),
                  ),
                );
              } catch {
                // controller may already be errored
              }
              controller.error(new Error(message));
            },
          },
        });
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
