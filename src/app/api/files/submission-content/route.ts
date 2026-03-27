import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getStorageBucket } from "@/lib/firebase-admin";

/**
 * Fetch and format parsed markdown content for all processed files in a submission.
 * Returns a single formatted string suitable for prompt interpolation.
 *
 * GET /api/files/submission-content?submissionId=xxx
 */
export async function GET(request: NextRequest) {
  try {
    const submissionId = request.nextUrl.searchParams.get("submissionId");
    if (!submissionId) {
      return NextResponse.json(
        { error: "Missing submissionId query parameter" },
        { status: 400 },
      );
    }

    const supabase = await createServerSupabaseClient();

    const { data: files, error } = await supabase
      .from("submission_files")
      .select("id, filename, parsed_content_url, processing_status")
      .eq("submission_id", submissionId)
      .eq("processing_status", "processed")
      .not("parsed_content_url", "is", null);

    if (error) {
      console.error("Error fetching submission files:", error);
      return NextResponse.json(
        { error: "Failed to fetch files" },
        { status: 500 },
      );
    }

    if (!files || files.length === 0) {
      return NextResponse.json({ content: "" });
    }

    const bucket = getStorageBucket();
    const sections: string[] = [];

    for (const file of files) {
      try {
        const url = new URL(file.parsed_content_url);
        const storagePath = url.pathname.replace(`/${bucket.name}/`, "");
        const [buffer] = await bucket.file(storagePath).download();
        const markdown = buffer.toString("utf-8");
        sections.push(`### ${file.filename}\n${markdown}`);
      } catch (downloadErr) {
        console.warn(
          `Failed to download parsed content for file ${file.id}:`,
          downloadErr,
        );
      }
    }

    if (sections.length === 0) {
      return NextResponse.json({ content: "" });
    }

    const content = `Consider the below file submissions of the student:\n\n${sections.join("\n\n")}`;
    return NextResponse.json({ content });
  } catch (err) {
    console.error("Error in submission-content route:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
