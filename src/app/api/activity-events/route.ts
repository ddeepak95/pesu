import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { ActivityEventInput, ALLOWED_EVENT_TYPES } from "@/types/activity";

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
 * Parse the request body. We primarily accept `application/json`, but also
 * handle `text/plain` (parsed as JSON) so the client can use transports that
 * don't always preserve JSON content-type headers.
 */
async function parseBody(request: NextRequest): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return request.json();
  }
  const text = await request.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

/**
 * POST /api/activity-events
 *
 * Inserts a semantic activity event. Idempotent on `event_id`: repeated
 * submissions of the same `eventId` are safely ignored.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await parseBody(request)) as ActivityEventInput;

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

    if (!ALLOWED_EVENT_TYPES.includes(body.eventType)) {
      return NextResponse.json(
        {
          error: `eventType must be one of: ${ALLOWED_EVENT_TYPES.join(", ")}`,
        },
        { status: 400 }
      );
    }

    const supabase = await createServerSupabaseClient();
    const resolvedClassId = await resolveClassId(body.classId, supabase);
    const resolvedUserId = isValidUuid(body.userId) ? body.userId : null;
    const resolvedEventId = isValidUuid(body.eventId) ? body.eventId : null;
    const resolvedClientTs = body.clientTs ?? null;

    // Idempotent insert keyed on event_id. If a row with the same event_id
    // already exists, the insert is ignored (no error, no duplicate row).
    // Legacy callers without event_id fall through to a standard insert.
    const insertPayload = {
      event_id: resolvedEventId,
      user_id: resolvedUserId,
      submission_id: body.submissionId || null,
      class_id: resolvedClassId,
      component_type: body.componentType,
      component_id: body.componentId,
      sub_component_id: body.subComponentId || null,
      event_type: body.eventType,
      client_ts: resolvedClientTs,
    };

    const query = resolvedEventId
      ? supabase
          .from("activity_events")
          .upsert(insertPayload, {
            onConflict: "event_id",
            ignoreDuplicates: true,
          })
          .select()
      : supabase.from("activity_events").insert(insertPayload).select().single();

    const { data, error } = await query;

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
