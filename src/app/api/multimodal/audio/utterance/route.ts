import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getStorageBucket } from "@/lib/firebase-admin";

type DbRole = "student" | "assistant";
type StorageRole = "user" | "bot";

function asInt(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string") return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function asBool(value: FormDataEntryValue | null): boolean {
  return typeof value === "string" && value.toLowerCase() === "true";
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
    const attemptNumber = asInt(formData.get("attemptNumber"));
    const utteranceOrdinal = asInt(formData.get("utteranceOrdinal"));
    const dbRole = asText(formData.get("dbRole")) as DbRole | null;
    const storageRole = asText(formData.get("storageRole")) as StorageRole | null;
    const interrupted = asBool(formData.get("interrupted"));
    const spokenAt = asText(formData.get("spokenAt"));
    const content = asText(formData.get("content")) ?? "";
    const generatedContent = asText(formData.get("generatedContent"));
    const chatMessageId = asText(formData.get("chatMessageId"));
    const audio = formData.get("audio");

    if (
      !submissionId ||
      !assignmentId ||
      questionOrder == null ||
      attemptNumber == null ||
      utteranceOrdinal == null ||
      (dbRole !== "student" && dbRole !== "assistant") ||
      (storageRole !== "user" && storageRole !== "bot") ||
      !(audio instanceof File)
    ) {
      return NextResponse.json(
        { error: "Missing required fields for utterance logging" },
        { status: 400 },
      );
    }

    const bucket = getStorageBucket();
    const bytes = Buffer.from(await audio.arrayBuffer());
    const safeSubmissionId = submissionId.replaceAll("/", "_").replaceAll("\\", "_");
    const storagePath = `voice-recordings/${safeSubmissionId}/${questionOrder}/${attemptNumber}/${storageRole}-${utteranceOrdinal}.wav`;
    const file = bucket.file(storagePath);
    await file.save(bytes, {
      contentType: audio.type || "audio/wav",
      resumable: false,
      metadata: { cacheControl: "private, max-age=0" },
    });
    await file.makePublic();
    const audioFileUrl = file.publicUrl();

    const utteranceId = `${submissionId}:${questionOrder}:${attemptNumber}:${storageRole}:${utteranceOrdinal}`;
    const supabase = await createServerSupabaseClient();

    const { data: existing } = await supabase
      .from("voice_messages")
      .select("id")
      .eq("assignment_id", assignmentId)
      .eq("utterance_id", utteranceId)
      .maybeSingle();

    const payload = {
      submission_id: submissionId,
      assignment_id: assignmentId,
      question_order: questionOrder,
      role: dbRole,
      content,
      audio_file_url: audioFileUrl,
      attempt_number: attemptNumber,
      interrupted,
      spoken_at: spokenAt,
      generated_content: generatedContent,
      utterance_id: utteranceId,
      chat_message_id: chatMessageId,
    };

    if (existing?.id) {
      const { error } = await supabase
        .from("voice_messages")
        .update(payload)
        .eq("id", existing.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("voice_messages").insert(payload);
      if (error) throw error;
    }

    return NextResponse.json({ ok: true, audioFileUrl, utteranceId });
  } catch (error) {
    console.error("[multimodal/audio/utterance]", error);
    return NextResponse.json(
      {
        error: "Failed to persist utterance audio",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
