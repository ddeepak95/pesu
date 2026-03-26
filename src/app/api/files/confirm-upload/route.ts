import { NextRequest, NextResponse, after } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

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
      if (data.mime_type === "application/pdf") {
        const apiKey = process.env.CLOUD_FUNCTIONS_API_KEY;
        if (!apiKey) return;

        const isLocal = process.env.CLOUD_FUNCTIONS_LOCAL === "true";
        const projectId = process.env.FIREBASE_PROJECT_ID;
        const region = process.env.FIREBASE_FUNCTIONS_REGION || "us-central1";
        const fnName = "parse_submission_file";

        const url = isLocal
          ? `http://127.0.0.1:5001/${projectId}/${region}/${fnName}`
          : `https://${region}-${projectId}.cloudfunctions.net/${fnName}`;

        try {
          await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": apiKey,
            },
            body: JSON.stringify({ fileId: data.id }),
          });
        } catch (err) {
          console.error("Failed to trigger PDF parsing:", err);
        }
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
