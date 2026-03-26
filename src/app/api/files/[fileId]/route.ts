import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getStorageBucket } from "@/lib/firebase-admin";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> },
) {
  try {
    const { fileId } = await params;

    if (!fileId) {
      return NextResponse.json(
        { error: "Missing fileId" },
        { status: 400 },
      );
    }

    const supabase = await createServerSupabaseClient();

    // Fetch the file record to get storage_path
    const { data: fileRecord, error: fetchError } = await supabase
      .from("submission_files")
      .select("id, storage_path")
      .eq("id", fileId)
      .single();

    if (fetchError || !fileRecord) {
      return NextResponse.json(
        { error: "File record not found" },
        { status: 404 },
      );
    }

    // Delete from GCS
    try {
      const bucket = getStorageBucket();
      await bucket.file(fileRecord.storage_path).delete();
    } catch (gcsErr) {
      // Log but don't fail -- the file may already be gone
      console.warn("GCS delete warning (file may not exist):", gcsErr);
    }

    // Delete the DB record
    const { error: deleteError } = await supabase
      .from("submission_files")
      .delete()
      .eq("id", fileId);

    if (deleteError) {
      console.error("Error deleting submission_files row:", deleteError);
      return NextResponse.json(
        { error: "Failed to delete file record" },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Error in file delete:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
