import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

interface ReleaseGradesRequestBody {
  assignmentId: string;
  /** true = open the gate (reveal finalized grades); false = hold again. */
  release: boolean;
}

/**
 * Assignment-level grade release gate (batch mode). Flips
 * assignments.grades_released_at for the whole assignment at once. Because student
 * visibility = (submission finalized) AND (grades_released_at set), this single
 * flag reveals every already-finalized submission and leaves un-graded ones hidden.
 *
 * Teacher authorization is enforced by the assignments UPDATE RLS policy (the
 * update affects 0 rows for a non-teacher, which we surface as 403).
 */
export async function POST(request: NextRequest) {
  try {
    const body: ReleaseGradesRequestBody = await request.json();
    const { assignmentId, release } = body;

    if (!assignmentId || typeof release !== "boolean") {
      return NextResponse.json(
        { error: "Missing required fields: assignmentId, release" },
        { status: 400 },
      );
    }

    const supabase = await createServerSupabaseClient();

    const { data, error } = await supabase
      .from("assignments")
      .update({ grades_released_at: release ? new Date().toISOString() : null })
      .eq("assignment_id", assignmentId)
      .select("assignment_id, grades_released_at");

    if (error) {
      console.error("release-grades update failed:", error);
      return NextResponse.json({ error: "Failed to update assignment" }, { status: 500 });
    }
    if (!data || data.length === 0) {
      // RLS filtered the row out (not a teacher of this class) or it doesn't exist.
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    return NextResponse.json({
      success: true,
      grades_released_at: data[0].grades_released_at,
    });
  } catch (error) {
    console.error("Release assignment grades error:", error);
    return NextResponse.json(
      {
        error: "Failed to release assignment grades",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
