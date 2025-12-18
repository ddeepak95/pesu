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
}

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

    const languageNames = Object.fromEntries(
      supportedLanguages.map((lang) => [lang.code, lang.name])
    );
    const languageName = languageNames[language] || "English";

    const rubricText = rubric
      .map((item) => `- ${item.item} (${item.points} points)`)
      .join("\n");

    const chatMessages = [
      {
        role: "system" as const,
        content: `You are a friendly tutoring assistant helping a student answer a question based on a rubric.
Your job is to have a short, focused conversation that helps the student give a strong answer.

For EVERY RESPONSE you give:
- Be encouraging and supportive.
- Ask clarifying questions.
- Give hints and partial feedback.
- Encourage the student to think and refine their answer.
- Keep responses concise and age-appropriate.

IMPORTANT:
- Respond only in ${languageName}.
- Do NOT give the full final answer outright; guide the student instead.

Question (what the teacher asked the student):
${questionPrompt}

Rubric (how the teacher will grade the answer):
${rubricText}

YOUR VERY FIRST MESSAGE TO THE STUDENT MUST:
1) Greet the student briefly.
2) Restate the question in simple, clear language so they understand it.
3) Clearly explain what kind of answer you expect (for example: “a few sentences explaining…”, “step-by-step reasoning about…”, etc.).
4) Invite the student to start by sharing what they think or already know about the question.

Do NOT start grading yet. Just explain the task and ask them to begin.`,
      },
      ...messages.map((message) => ({
        role:
          message.role === "student"
            ? ("user" as const)
            : ("assistant" as const),
        content: message.content,
      })),
    ];

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

    // Create streaming completion
    const stream = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: chatMessages,
      stream: true,
    });

    // Return a streaming response
    const encoder = new TextEncoder();
    const readableStream = new ReadableStream({
      async start(controller) {
        let fullReply = "";
        try {
          for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || "";
            if (content) {
              fullReply += content;
              controller.enqueue(encoder.encode(content));
            }
          }

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
          controller.error(error);
        }
      },
    });

    return new Response(readableStream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
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

