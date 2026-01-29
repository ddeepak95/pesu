import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { ActivityEventInput } from "@/types/activity";

/**
 * POST /api/activity-events
 * Creates an activity event (INSERT-only, no upsert)
 * For tracking attempt_started and attempt_ended timestamps
 */
export async function POST(request: NextRequest) {
  try {
    const body: ActivityEventInput = await request.json();

    // Validate required fields
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

    if (!body.eventType) {
      return NextResponse.json(
        { error: "eventType is required" },
        { status: 400 }
      );
    }

    // Validate eventType
    if (!["attempt_started", "attempt_ended"].includes(body.eventType)) {
      return NextResponse.json(
        { error: "eventType must be 'attempt_started' or 'attempt_ended'" },
        { status: 400 }
      );
    }

    const supabase = await createServerSupabaseClient();

    // Insert the activity event (no upsert - each event is a new row)
    const { data, error } = await supabase
      .from("activity_events")
      .insert({
        user_id: body.userId || null,
        submission_id: body.submissionId || null,
        class_id: body.classId || null,
        component_type: body.componentType,
        component_id: body.componentId,
        sub_component_id: body.subComponentId || null,
        event_type: body.eventType,
      })
      .select()
      .single();

    if (error) {
      console.error("Error inserting activity event:", error);
      return NextResponse.json(
        { error: "Failed to log activity event" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Error in activity-events API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
