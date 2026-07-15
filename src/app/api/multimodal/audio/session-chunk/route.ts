import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getStorageBucket } from "@/lib/firebase-admin";

function asInt(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string") return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function asText(value: FormDataEntryValue | null): string | null {
  return typeof value === "string" ? value : null;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const submissionId = asText(formData.get("submissionId"));
    const assignmentId = asText(formData.get("assignmentId"));
    const questionOrder = asInt(formData.get("questionOrder"));
    const questionId = asText(formData.get("questionId"));
    const attemptNumber = asInt(formData.get("attemptNumber"));
    const attemptId = asText(formData.get("attemptId"));
    const chunkIndex = asInt(formData.get("chunkIndex"));
    const recordingStartedAt = asText(formData.get("recordingStartedAt"));
    const audio = formData.get("audio");

    if (
      !submissionId ||
      !assignmentId ||
      questionOrder == null ||
      !questionId ||
      attemptNumber == null ||
      chunkIndex == null ||
      !(audio instanceof File)
    ) {
      return NextResponse.json(
        { error: "Missing required fields for session chunk logging" },
        { status: 400 },
      );
    }

    const bucket = getStorageBucket();
    const bytes = Buffer.from(await audio.arrayBuffer());
    const safeSubmissionId = submissionId.replaceAll("/", "_").replaceAll("\\", "_");
    const storagePath = `voice-recordings/${safeSubmissionId}/${questionOrder}/${attemptNumber}/session_composite_chunk_${String(chunkIndex).padStart(3, "0")}.wav`;
    const file = bucket.file(storagePath);
    await file.save(bytes, {
      contentType: audio.type || "audio/wav",
      resumable: false,
      metadata: { cacheControl: "private, max-age=0" },
    });
    await file.makePublic();
    const audioFileUrl = file.publicUrl();

    const supabase = await createServerSupabaseClient();
    const { data: current, error: currentError } = await supabase
      .from("submission_session_audio")
      .select("composite_audio_chunk_urls")
      .eq("submission_id", submissionId)
      .eq("question_order", questionOrder)
      .eq("attempt_number", attemptNumber)
      .maybeSingle();
    if (currentError) throw currentError;

    const urls = Array.isArray(current?.composite_audio_chunk_urls)
      ? [...current.composite_audio_chunk_urls, audioFileUrl]
      : [audioFileUrl];

    const payload = {
      submission_id: submissionId,
      question_order: questionOrder,
      question_id: questionId,
      attempt_number: attemptNumber,
      composite_audio_chunk_urls: urls,
      recording_started_at: recordingStartedAt ?? null,
      attempt_id: attemptId,
    };

    const { error } = await supabase
      .from("submission_session_audio")
      .upsert(payload, {
        onConflict: "submission_id,question_order,attempt_number",
      });
    if (error) throw error;

    return NextResponse.json({ ok: true, audioFileUrl });
  } catch (error) {
    console.error("[multimodal/audio/session-chunk]", error);
    return NextResponse.json(
      {
        error: "Failed to persist session audio chunk",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
