import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getStorageBucket } from "@/lib/firebase-admin";
import {
  type FileSubmissionConfig,
  allowedFileTypesFromConfig,
} from "@/types/assignment";

interface RequestUploadBody {
  submissionId: string;
  assignmentId: string;
  filename: string;
  contentType: string;
  fileSize: number;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const SIGNED_URL_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes

export async function POST(request: NextRequest) {
  try {
    const body: RequestUploadBody = await request.json();
    const { submissionId, assignmentId, filename, contentType, fileSize } =
      body;

    if (!submissionId || !assignmentId || !filename || !contentType) {
      return NextResponse.json(
        {
          error:
            "Missing required fields: submissionId, assignmentId, filename, contentType",
        },
        { status: 400 },
      );
    }

    if (fileSize > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File size exceeds maximum of ${MAX_FILE_SIZE / 1024 / 1024}MB` },
        { status: 400 },
      );
    }

    const supabase = await createServerSupabaseClient();

    // Validate the assignment exists and has file submission enabled
    const { data: assignment, error: assignmentError } = await supabase
      .from("assignments")
      .select("assignment_id, file_submission_config")
      .eq("assignment_id", assignmentId)
      .single();

    if (assignmentError || !assignment) {
      return NextResponse.json(
        { error: "Assignment not found" },
        { status: 404 },
      );
    }

    const config = assignment.file_submission_config as FileSubmissionConfig | null;

    if (!config?.required) {
      return NextResponse.json(
        { error: "File submission is not enabled for this assignment" },
        { status: 400 },
      );
    }

    const allowedFileTypes = allowedFileTypesFromConfig(config);
    const ext = "." + filename.split(".").pop()?.toLowerCase();
    if (!allowedFileTypes.includes(ext)) {
      return NextResponse.json(
        {
          error: `File type ${ext} is not allowed. Allowed types: ${allowedFileTypes.join(", ")}`,
        },
        { status: 400 },
      );
    }

    // Validate submission exists
    const { data: submission, error: submissionError } = await supabase
      .from("submissions")
      .select("submission_id")
      .eq("submission_id", submissionId)
      .eq("assignment_id", assignmentId)
      .single();

    if (submissionError || !submission) {
      return NextResponse.json(
        { error: "Submission not found" },
        { status: 404 },
      );
    }

    // Generate GCS path and signed URL
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const timestamp = Date.now();
    const storagePath = `submission-files/${assignmentId}/${submissionId}/${timestamp}_${safeName}`;

    const bucket = getStorageBucket();
    const file = bucket.file(storagePath);

    const [signedUrl] = await file.getSignedUrl({
      version: "v4",
      action: "write",
      expires: Date.now() + SIGNED_URL_EXPIRY_MS,
      contentType,
    });

    // Insert the file record
    const { data: fileRecord, error: insertError } = await supabase
      .from("submission_files")
      .insert({
        submission_id: submissionId,
        assignment_id: assignmentId,
        filename,
        file_url: `https://storage.googleapis.com/${bucket.name}/${storagePath}`,
        file_size: fileSize,
        mime_type: contentType,
        storage_path: storagePath,
        processing_status: "uploading",
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error inserting submission_files row:", insertError);
      return NextResponse.json(
        { error: "Failed to create file record" },
        { status: 500 },
      );
    }

    // Append file id to submissions.file_ids
    const { data: sub } = await supabase
      .from("submissions")
      .select("file_ids")
      .eq("submission_id", submissionId)
      .single();

    const currentIds: string[] = sub?.file_ids ?? [];
    await supabase
      .from("submissions")
      .update({ file_ids: [...currentIds, fileRecord.id] })
      .eq("submission_id", submissionId);

    return NextResponse.json({ signedUrl, fileRecord });
  } catch (err) {
    console.error("Error in request-upload:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
