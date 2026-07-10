import { NextRequest, NextResponse } from "next/server";

import { getClassDbIdForAssignment } from "@/lib/assignments/assignmentClassCache";
import { resolveInteractionSupportForClass } from "@/lib/multimodal/resolveInteractionSupport";
import { createServiceRoleClient } from "@/lib/supabase-server";

export async function GET(request: NextRequest) {
  try {
    // Teacher surfaces pass classDbId directly; the student runtime only has an
    // assignmentId, so resolve its class server-side.
    let classDbId = request.nextUrl.searchParams.get("classDbId");
    const assignmentId = request.nextUrl.searchParams.get("assignmentId");
    if (!classDbId && assignmentId) {
      classDbId = await getClassDbIdForAssignment(
        createServiceRoleClient(),
        assignmentId,
      );
    }
    if (!classDbId) {
      return NextResponse.json(
        { error: "Missing required query param: classDbId or assignmentId" },
        { status: 400 },
      );
    }

    const support = await resolveInteractionSupportForClass(classDbId);

    return NextResponse.json(support);
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
