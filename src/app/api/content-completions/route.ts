import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

/**
 * POST /api/content-completions
 * Mark a content item as complete for the current user
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { contentItemId } = body;

    if (!contentItemId) {
      return NextResponse.json(
        { error: "contentItemId is required" },
        { status: 400 }
      );
    }

    const supabase = await createServerSupabaseClient();

    // Get the current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Upsert the completion (insert or do nothing if already exists)
    const { data, error } = await supabase
      .from("student_content_completions")
      .upsert(
        {
          student_id: user.id,
          content_item_id: contentItemId,
          completed_at: new Date().toISOString(),
        },
        {
          onConflict: "student_id,content_item_id",
        }
      )
      .select()
      .single();

    if (error) {
      console.error("Error marking content as complete:", error);
      return NextResponse.json(
        { error: "Failed to mark content as complete" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Error in content-completions POST:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/content-completions
 * Remove completion mark for a content item
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const contentItemId = searchParams.get("contentItemId");

    if (!contentItemId) {
      return NextResponse.json(
        { error: "contentItemId is required" },
        { status: 400 }
      );
    }

    const supabase = await createServerSupabaseClient();

    // Get the current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { error } = await supabase
      .from("student_content_completions")
      .delete()
      .eq("student_id", user.id)
      .eq("content_item_id", contentItemId);

    if (error) {
      console.error("Error unmarking content completion:", error);
      return NextResponse.json(
        { error: "Failed to unmark content completion" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in content-completions DELETE:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/content-completions
 * Fetch completions for the current user
 * Query params:
 *   - contentItemIds: comma-separated list of content item IDs
 *   - contentItemId: single content item ID (for checking single item)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const contentItemIds = searchParams.get("contentItemIds");
    const contentItemId = searchParams.get("contentItemId");

    const supabase = await createServerSupabaseClient();

    // Get the current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    let query = supabase
      .from("student_content_completions")
      .select("*")
      .eq("student_id", user.id);

    if (contentItemId) {
      // Single item check
      query = query.eq("content_item_id", contentItemId);
    } else if (contentItemIds) {
      // Multiple items check
      const ids = contentItemIds.split(",").filter(Boolean);
      if (ids.length > 0) {
        query = query.in("content_item_id", ids);
      }
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching completions:", error);
      return NextResponse.json(
        { error: "Failed to fetch completions" },
        { status: 500 }
      );
    }

    // If checking single item, return boolean
    if (contentItemId) {
      return NextResponse.json({
        isComplete: data && data.length > 0,
        data: data?.[0] || null,
      });
    }

    // Return array of completions
    return NextResponse.json({ completions: data || [] });
  } catch (error) {
    console.error("Error in content-completions GET:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
