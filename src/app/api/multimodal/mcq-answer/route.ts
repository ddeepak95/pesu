import { NextRequest, NextResponse } from "next/server";

import { updateChatMessageActionAnswer } from "@/lib/queries/chatMessageActions";
import { createServerSupabaseClient } from "@/lib/supabase-server";

interface McqAnswerRequestBody {
  actionId: string;
  answeredIndex: number;
}

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json()) as McqAnswerRequestBody;
    const { actionId, answeredIndex } = body;

    if (
      !actionId ||
      typeof answeredIndex !== "number" ||
      !Number.isInteger(answeredIndex) ||
      answeredIndex < 0
    ) {
      return NextResponse.json(
        { error: "Missing or invalid fields" },
        { status: 400 },
      );
    }

    const supabase = await createServerSupabaseClient();
    await updateChatMessageActionAnswer(supabase, { id: actionId, answeredIndex });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[multimodal/mcq-answer]", error);
    return NextResponse.json(
      {
        error: "Failed to record MCQ answer",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
