import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getStorageBucket } from "@/lib/firebase-admin";

const SIGNED_URL_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Generate a short-lived signed download URL for a submission file.
 * Use ?type=parsed to get the parsed markdown version instead of the original.
 */
export async function GET(
  request: NextRequest,
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

    const wantParsed =
      request.nextUrl.searchParams.get("type") === "parsed";

    const supabase = await createServerSupabaseClient();

    const { data: fileRecord, error: fetchError } = await supabase
      .from("submission_files")
      .select(
        "id, storage_path, filename, mime_type, parsed_content_url, processing_status",
      )
      .eq("id", fileId)
      .single();

    if (fetchError || !fileRecord) {
      return NextResponse.json(
        { error: "File record not found" },
        { status: 404 },
      );
    }

    const bucket = getStorageBucket();
    let storagePath: string;
    let disposition: string;

    if (wantParsed) {
      if (
        fileRecord.processing_status !== "processed" ||
        !fileRecord.parsed_content_url
      ) {
        return NextResponse.json(
          { error: "Parsed content not available" },
          { status: 404 },
        );
      }
      const url = new URL(fileRecord.parsed_content_url);
      storagePath = url.pathname.replace(`/${bucket.name}/`, "");
      const baseName = fileRecord.filename.replace(/\.[^.]+$/, "");
      disposition = `inline; filename="${baseName}.md"`;
    } else {
      storagePath = fileRecord.storage_path;
      disposition = `inline; filename="${fileRecord.filename}"`;
    }

    const file = bucket.file(storagePath);

    const [signedUrl] = await file.getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + SIGNED_URL_EXPIRY_MS,
      responseDisposition: disposition,
    });

    return NextResponse.json({ url: signedUrl });
  } catch (err) {
    console.error("Error generating download URL:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

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

    const { data: fileRecord, error: fetchError } = await supabase
      .from("submission_files")
      .select("id, storage_path, submission_id, parsed_content_url")
      .eq("id", fileId)
      .single();

    if (fetchError || !fileRecord) {
      return NextResponse.json(
        { error: "File record not found" },
        { status: 404 },
      );
    }

    const bucket = getStorageBucket();

    // Delete original file from GCS
    try {
      await bucket.file(fileRecord.storage_path).delete();
    } catch (gcsErr) {
      console.warn("GCS delete warning (original may not exist):", gcsErr);
    }

    // Delete parsed markdown from GCS if it exists
    if (fileRecord.parsed_content_url) {
      try {
        const parsedUrl = new URL(fileRecord.parsed_content_url);
        const parsedPath = parsedUrl.pathname.replace(`/${bucket.name}/`, "");
        await bucket.file(parsedPath).delete();
      } catch (gcsErr) {
        console.warn("GCS delete warning (parsed may not exist):", gcsErr);
      }
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

    // Remove file id from submissions.file_ids
    const { data: sub } = await supabase
      .from("submissions")
      .select("file_ids")
      .eq("submission_id", fileRecord.submission_id)
      .single();

    if (sub?.file_ids) {
      await supabase
        .from("submissions")
        .update({
          file_ids: sub.file_ids.filter((id: string) => id !== fileId),
        })
        .eq("submission_id", fileRecord.submission_id);
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
