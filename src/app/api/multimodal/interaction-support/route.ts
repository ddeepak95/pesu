import { NextRequest, NextResponse } from "next/server";

import { resolveAudioInputSupportForClass } from "@/lib/multimodal/resolveAudioInputSupport";

export async function GET(request: NextRequest) {
  try {
    const classDbId = request.nextUrl.searchParams.get("classDbId");
    if (!classDbId) {
      return NextResponse.json(
        { error: "Missing required query param: classDbId" },
        { status: 400 },
      );
    }

    const audioInputSupported = await resolveAudioInputSupportForClass(classDbId);

    return NextResponse.json({ audioInputSupported });
  } catch (error) {
    console.error("[multimodal/interaction-support]", error);
    return NextResponse.json(
      {
        error: "Failed to resolve multimodal interaction support",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
