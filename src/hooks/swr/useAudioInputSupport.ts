"use client";

import useSWR from "swr";

interface AudioInputSupportResponse {
  audioInputSupported: boolean;
}

async function fetchAudioInputSupport(
  classDbId: string,
): Promise<AudioInputSupportResponse> {
  const response = await fetch(
    `/api/multimodal/interaction-support?classDbId=${encodeURIComponent(classDbId)}`,
  );
  const body = (await response.json().catch(() => ({}))) as
    | AudioInputSupportResponse
    | { error?: string };
  if (!response.ok) {
    throw new Error(
      body && "error" in body ? body.error : "Failed to load audio input support",
    );
  }
  return body as AudioInputSupportResponse;
}

/**
 * Whether the class's currently-bound chat model supports direct audio input
 * — gates the "direct audio input" teacher toggle. See
 * dev-docs/multimodal-interaction-config-plan.md §3g/§6.
 */
export function useAudioInputSupport(classDbId: string | null | undefined) {
  return useSWR<AudioInputSupportResponse>(
    classDbId ? `multimodal-interaction-support:${classDbId}` : null,
    () => fetchAudioInputSupport(classDbId!),
  );
}
