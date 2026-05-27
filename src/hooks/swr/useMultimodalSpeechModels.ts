"use client";

import useSWR from "swr";

interface MultimodalSpeechModelsResponse {
  sttModelId: string;
  ttsModelId: string;
}

async function fetchMultimodalSpeechModels(
  assignmentId: string,
): Promise<MultimodalSpeechModelsResponse> {
  const response = await fetch(
    `/api/multimodal/speech-models?assignmentId=${encodeURIComponent(assignmentId)}`,
  );
  const body = (await response.json().catch(() => ({}))) as
    | MultimodalSpeechModelsResponse
    | { error?: string };
  if (!response.ok) {
    throw new Error(body && "error" in body ? body.error : "Failed to load models");
  }
  return body as MultimodalSpeechModelsResponse;
}

export function useMultimodalSpeechModels(assignmentId: string | null) {
  return useSWR<MultimodalSpeechModelsResponse>(
    assignmentId ? `multimodal-speech-models:${assignmentId}` : null,
    () => fetchMultimodalSpeechModels(assignmentId!),
  );
}
