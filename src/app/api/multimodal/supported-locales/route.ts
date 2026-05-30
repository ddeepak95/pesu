import { NextRequest, NextResponse } from "next/server";
import { intersectSpeechLocales } from "@/lib/konvo-voice/konvoLocaleCapabilitiesHelpers";
import { resolveMultimodalSpeechModelsForClass } from "@/lib/konvo-voice/resolveMultimodalSpeechModelsForClass";

/**
 * Locales the class's configured STT + TTS models both support. Class-scoped
 * (no assignmentId needed) so the teacher editor can restrict the support-
 * language picker before an assignment exists.
 */
export async function GET(request: NextRequest) {
  try {
    const classDbId = request.nextUrl.searchParams.get("classDbId");
    if (!classDbId) {
      return NextResponse.json(
        { error: "Missing required query param: classDbId" },
        { status: 400 },
      );
    }

    const { sttModelId, ttsModelId } =
      await resolveMultimodalSpeechModelsForClass(classDbId);

    return NextResponse.json({
      supportedLocales: intersectSpeechLocales(sttModelId, ttsModelId),
    });
  } catch (error) {
    console.error("[multimodal/supported-locales]", error);
    return NextResponse.json(
      {
        error: "Failed to resolve supported locales",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
