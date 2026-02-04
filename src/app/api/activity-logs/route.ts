import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { ActivityLogInput } from "@/types/activity";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isValidUuid = (value?: string | null) =>
  !!value && UUID_REGEX.test(value);

const resolveClassId = async (
  classId: string | undefined,
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>
) => {
  if (!classId) {
    return null;
  }

  if (isValidUuid(classId)) {
    return classId;
  }

  const { data } = await supabase
    .from("classes")
    .select("id")
    .eq("class_id", classId)
    .maybeSingle();

  return data?.id ?? null;
};

/**
 * POST /api/activity-logs
 * Creates or updates an activity log (upsert based on session_id)
 * Simplified: only tracks total time
 */
export async function POST(request: NextRequest) {
  try {
    const body: ActivityLogInput = await request.json();

    // Validate required fields
    if (!body.sessionId) {
      return NextResponse.json(
        { error: "sessionId is required" },
        { status: 400 }
      );
    }

    if (!body.componentType) {
      return NextResponse.json(
        { error: "componentType is required" },
        { status: 400 }
      );
    }

    if (!body.componentId) {
      return NextResponse.json(
        { error: "componentId is required" },
        { status: 400 }
      );
    }

    const supabase = await createServerSupabaseClient();
    const resolvedClassId = await resolveClassId(body.classId, supabase);
    const resolvedUserId = isValidUuid(body.userId) ? body.userId : null;

    // Upsert the activity log (insert or update based on session_id)
    const { data, error } = await supabase
      .from("activity_logs")
      .upsert(
        {
          session_id: body.sessionId,
          user_id: resolvedUserId,
          submission_id: body.submissionId || null,
          class_id: resolvedClassId,
          component_type: body.componentType,
          component_id: body.componentId,
          sub_component_id: body.subComponentId || null,
          total_time_ms: body.totalTimeMs,
        },
        {
          onConflict: "session_id",
        }
      )
      .select()
      .single();

    if (error) {
      console.error("Error upserting activity log:", error);
      return NextResponse.json(
        { error: "Failed to save activity log" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Error in activity-logs API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
