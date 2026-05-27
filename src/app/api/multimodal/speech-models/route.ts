import { NextRequest, NextResponse } from "next/server";
import {
  resolveMultimodalSpeechModelsForAssignment,
} from "@/lib/prototype/konvo-voice/resolveMultimodalSpeechModelsForClass";

export async function GET(request: NextRequest) {
  try {
    const assignmentId = request.nextUrl.searchParams.get("assignmentId");
    if (!assignmentId) {
      return NextResponse.json(
        { error: "Missing required query param: assignmentId" },
        { status: 400 },
      );
    }

    const resolved =
      await resolveMultimodalSpeechModelsForAssignment(assignmentId);
    if (!resolved) {
      return NextResponse.json(
        { error: "Assignment not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(resolved);
  } catch (error) {
    console.error("[multimodal/speech-models]", error);
    return NextResponse.json(
      {
        error: "Failed to resolve multimodal speech models",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
