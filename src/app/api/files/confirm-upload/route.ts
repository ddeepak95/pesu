import { NextRequest, NextResponse, after } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { parseSubmissionFile } from "@/lib/parseSubmissionFile";

interface ConfirmUploadBody {
  fileId: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: ConfirmUploadBody = await request.json();
    const { fileId } = body;

    if (!fileId) {
      return NextResponse.json(
        { error: "Missing required field: fileId" },
        { status: 400 },
      );
    }

    const supabase = await createServerSupabaseClient();

    const { data, error } = await supabase
      .from("submission_files")
      .update({ processing_status: "uploaded" })
      .eq("id", fileId)
      .eq("processing_status", "uploading")
      .select()
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: "File record not found or already confirmed" },
        { status: 404 },
      );
    }

    after(async () => {
      try {
        await parseSubmissionFile(data.id);
      } catch (err) {
        console.error("Failed to parse submission file:", err);
      }
    });

    return NextResponse.json({ fileRecord: data });
  } catch (err) {
    console.error("Error in confirm-upload:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
