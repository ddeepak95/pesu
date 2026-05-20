import { NextResponse } from "next/server";
import { getSelectableModels } from "@/lib/prototype/konvo-voice/sessionCatalog";

export async function GET() {
  const sttModels = getSelectableModels("speech_to_text").map((m) => ({
    id: m.id,
    label: m.label,
    providerId: m.providerId,
  }));
  const ttsModels = getSelectableModels("text_to_speech").map((m) => ({
    id: m.id,
    label: m.label,
    providerId: m.providerId,
  }));
  const llmModels = getSelectableModels("text_generation").map((m) => ({
    id: m.id,
    label: m.label,
    providerId: m.providerId,
  }));

  return NextResponse.json({ sttModels, ttsModels, llmModels });
}
