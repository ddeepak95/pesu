import { NextRequest, NextResponse } from "next/server";

import { resolveAvailableActionKindsForClass } from "@/lib/multimodal/actions/resolveAvailableActions";

export async function GET(request: NextRequest) {
  try {
    const classDbId = request.nextUrl.searchParams.get("classDbId");
    if (!classDbId) {
      return NextResponse.json(
        { error: "Missing required query param: classDbId" },
        { status: 400 },
      );
    }

    const availableActions =
      await resolveAvailableActionKindsForClass(classDbId);

    return NextResponse.json({ availableActions });
  } catch (error) {
    console.error("[multimodal/available-actions]", error);
    return NextResponse.json(
      {
        error: "Failed to resolve available multimodal actions",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
