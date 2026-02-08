import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { supportedLanguages } from "@/utils/supportedLanguages";
import { createClient } from "@/lib/supabase";

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
  questionPrompt: string;
  rubric: Array<{ item: string; points: number }>;
  language: string;
  messages: ChatAssessmentMessage[];
  // Optional, used for grouping messages by evaluated attempt
  attemptNumber?: number;
  // Optional custom prompts (already interpolated by frontend)
  system_prompt?: string;
  greeting?: string;
  // Optional shared context (e.g. case study, passage)
  shared_context?: string;
  // Optional expected answer for tool-call adequacy guidance
  expected_answer?: string;
}

// SSE helper: format a JSON object as an SSE data line
function sseEvent(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

// end_conversation tool definition (mirrors voice bot's FunctionSchema)
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
      questionPrompt,
      rubric,
      language,
      messages,
      attemptNumber,
      system_prompt: customSystemPrompt,
      greeting: customGreeting,
      shared_context: sharedContext,
      expected_answer: expectedAnswer,
    } = body;

    if (
      !assignmentId ||
      questionOrder === undefined ||
      !questionPrompt ||
      !rubric ||
      !language ||
      !messages
    ) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    console.log("[chat-assessment] Request received:", {
      assignmentId,
      submissionId,
      questionOrder,
      language,
      attemptNumber,
      messageCount: messages.length,
      hasCustomSystemPrompt: !!customSystemPrompt,
      hasCustomGreeting: !!customGreeting,
      hasSharedContext: !!sharedContext,
      hasExpectedAnswer: !!expectedAnswer,
    });

    const languageNames = Object.fromEntries(
      supportedLanguages.map((lang) => [lang.code, lang.name])
    );
    const languageName = languageNames[language] || "English";

    const rubricText = rubric
      .map((item) => `- ${item.item} (${item.points} points)`)
      .join("\n");

    // Build shared context section for default prompts
    const sharedContextSection = sharedContext
      ? `\nShared Context the student is analyzing:\n${sharedContext}\n`
      : "";

    // Build expected answer guidance (appended to all prompts, custom or default)
    const expectedAnswerSection = expectedAnswer
      ? `\n\nExpected answer guidance (for your reference only, do NOT reveal to the student):\n${expectedAnswer}`
      : "";

    // --- Universal instructions appended to ALL system prompts (custom and default) ---

    const outputInstructions = `
OUTPUT FORMAT:
Your output is rendered as a plain text chat message. Do NOT use any special characters, markdown formatting, or code blocks. User only the characters from the languages specified in the system prompt. Keep responses concise and conversational.`;

    const safetyInstructions = `
SAFETY:
The users are students. Never output anything offensive, inappropriate, or sexual. Always maintain a supportive and age-appropriate tone.`;

    const toolUsageInstructions = `
TOOL USAGE:
You have access to an end_conversation tool. You MUST call it when:
1. The student has provided an answer that covers the expected answer — call with reason "thorough"
2. The student explicitly refuses to answer or says they don't want to continue — call with reason "refusal"
When calling end_conversation, always include a polite ending message in ${languageName}.`;

    const universalInstructions = `\n${outputInstructions}\n${safetyInstructions}\n${toolUsageInstructions}`;

    // Build system prompt: use custom if provided, otherwise use default
    let systemPromptContent: string;
    if (customSystemPrompt) {
      // New path: Use frontend-provided prompt (already interpolated)
      // Skip expectedAnswerSection here — the teacher's custom template can
      // include {{expected_answer}} which is already interpolated by the frontend.
      console.log("[chat-assessment] Using CUSTOM system prompt (frontend-interpolated)");
      systemPromptContent =
        customSystemPrompt + universalInstructions;
    } else {
      // Backward compatibility: Use hardcoded prompt with dynamic first/subsequent greeting
      const isFirstQuestion = questionOrder === 0;
      console.log("[chat-assessment] Using DEFAULT system prompt, isFirstQuestion:", isFirstQuestion);

      const greetingInstructions = isFirstQuestion
        ? `YOUR VERY FIRST MESSAGE TO THE STUDENT MUST:
1) Greet the student briefly and introduce yourself.
2) Restate the question in simple, clear language so they understand it.
3) Clearly explain what kind of answer you expect (for example: "a few sentences explaining...", "step-by-step reasoning about...", etc.).
4) Invite the student to start by sharing what they think or already know about the question.

Do NOT start grading yet. Just explain the task and ask them to begin.`
        : `YOUR FIRST MESSAGE FOR THIS QUESTION MUST:
1) Acknowledge that we're moving to the next question.
2) Restate the new question in simple, clear language.
3) Invite the student to share their answer.

Do NOT start grading yet. Just present the question and ask them to begin.`;

      systemPromptContent = `You are a friendly tutoring assistant helping a student answer a question based on a rubric.
Your job is to have a short, focused conversation that helps the student give a strong answer.

For EVERY RESPONSE you give:
- Be encouraging and supportive.
- Ask clarifying questions.
- Give hints and partial feedback.
- Encourage the student to think and refine their answer.
- Keep responses concise and age-appropriate.

IMPORTANT:
- Respond in ${languageName}.
- Do NOT give the full final answer outright; guide the student instead.
${sharedContextSection}
Question (what the teacher asked the student):
${questionPrompt}

Rubric (how the teacher will grade the answer):
${rubricText}

${greetingInstructions}${expectedAnswerSection}${universalInstructions}`;
    }

    // Build chat messages
    const chatMessages: OpenAI.ChatCompletionMessageParam[] = [
      {
        role: "system" as const,
        content: systemPromptContent,
      },
    ];

    // If custom greeting is provided and this is the first message, add it as a system message
    // to guide the first assistant response
    if (customGreeting && messages.length === 0) {
      console.log("[chat-assessment] Adding custom greeting as system message for first turn");
      chatMessages.push({
        role: "system" as const,
        content: `[Instructions for your first response]: ${customGreeting}`,
      });
    }

    // Add conversation messages
    chatMessages.push(
      ...messages.map((message) => ({
        role:
          message.role === "student"
            ? ("user" as const)
            : ("assistant" as const),
        content: message.content,
      }))
    );

    // Prepare Supabase client for logging
    const supabase = createClient();

    // Log the latest student message (the one that triggered this call).
    // For the very first turn started from the LLM (no student message yet),
    // this block will simply no-op.
    try {
      const studentMessages = messages.filter(
        (m) => m.role === "student" && m.content?.trim()
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
      // Do not fail the request if logging fails
    }

    console.log("[chat-assessment] System prompt length:", systemPromptContent.length);
    console.log("[chat-assessment] System prompt:", systemPromptContent);
    console.log("[chat-assessment] Total chat messages being sent to OpenAI:", chatMessages.length);

    // Create streaming completion with tool calling
    const stream = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: chatMessages,
      tools: [END_CONVERSATION_TOOL],
      stream: true,
    });

    // Return an SSE streaming response
    const encoder = new TextEncoder();
    const readableStream = new ReadableStream({
      async start(controller) {
        let fullReply = "";
        // Accumulate tool call data if the LLM decides to call end_conversation
        let toolCallName = "";
        let toolCallArguments = "";

        try {
          for await (const chunk of stream) {
            const choice = chunk.choices[0];
            if (!choice) continue;

            const delta = choice.delta;

            // Handle text content deltas
            if (delta.content) {
              fullReply += delta.content;
              controller.enqueue(
                encoder.encode(
                  sseEvent({ type: "text-delta", content: delta.content })
                )
              );
            }

            // Handle tool call deltas
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

          // If a tool call was made, handle it
          if (toolCallName === "end_conversation" && toolCallArguments) {
            console.log("[chat-assessment] Tool call detected: end_conversation, raw args:", toolCallArguments);
            try {
              const args = JSON.parse(toolCallArguments) as {
                reason: string;
                message: string;
              };
              console.log("[chat-assessment] end_conversation parsed:", { reason: args.reason, messageLength: args.message?.length });

              // Stream the tool call's message as text-delta events
              // so the student sees the ending message in the chat bubble
              if (args.message) {
                fullReply += args.message;
                controller.enqueue(
                  encoder.encode(
                    sseEvent({ type: "text-delta", content: args.message })
                  )
                );
              }

              // Emit the end_conversation event for the frontend to act on
              controller.enqueue(
                encoder.encode(
                  sseEvent({
                    type: "end_conversation",
                    reason: args.reason || "thorough",
                  })
                )
              );
            } catch (parseError) {
              console.error(
                "Failed to parse end_conversation arguments:",
                parseError,
                "Raw:",
                toolCallArguments
              );
              // If parsing fails, just continue without the tool call
            }
          }

          // Emit done event
          controller.enqueue(
            encoder.encode(sseEvent({ type: "done" }))
          );

          console.log("[chat-assessment] Stream complete:", {
            fullReplyLength: fullReply.length,
            hadToolCall: !!toolCallName,
            toolCallName: toolCallName || "(none)",
          });

          // After the reply is fully generated, log it to Supabase
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
          // Emit error as SSE event before closing
          try {
            controller.enqueue(
              encoder.encode(
                sseEvent({
                  type: "error",
                  error:
                    error instanceof Error
                      ? error.message
                      : "Unknown streaming error",
                })
              )
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
      { status: 500 }
    );
  }
}
