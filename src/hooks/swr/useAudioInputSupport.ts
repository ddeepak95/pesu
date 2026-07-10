"use client";

import useSWR from "swr";

interface InteractionSupportResponse {
  /** Chat model supports direct audio input (gates the direct-audio toggle). */
  audioInputSupported: boolean;
  /** A genuinely-usable speech_to_text binding exists. */
  sttSupported: boolean;
  /** Learners can use audio input at all (STT OR direct-audio). */
  audioInputAvailable: boolean;
}

async function fetchInteractionSupport(
  query: string,
): Promise<InteractionSupportResponse> {
  const response = await fetch(
    `/api/multimodal/interaction-support?${query}`,
  );
  const body = (await response.json().catch(() => ({}))) as
    | InteractionSupportResponse
    | { error?: string };
  if (!response.ok) {
    throw new Error(
      body && "error" in body ? body.error : "Failed to load audio input support",
    );
  }
  return body as InteractionSupportResponse;
}

/**
 * Multimodal interaction capabilities for a class — direct-audio support, STT
 * support, and the combined audio-input availability. Gates the teacher config
 * toggles. See dev-docs/multimodal-interaction-config-plan.md §3g/§6.
 */
export function useAudioInputSupport(classDbId: string | null | undefined) {
  return useSWR<InteractionSupportResponse>(
    classDbId ? `multimodal-interaction-support:class:${classDbId}` : null,
    () => fetchInteractionSupport(`classDbId=${encodeURIComponent(classDbId!)}`),
  );
}

/**
 * Same capabilities resolved by assignment (the student runtime only has an
 * assignmentId; the route resolves its class server-side).
 */
export function useInteractionSupportByAssignment(
  assignmentId: string | null | undefined,
) {
  return useSWR<InteractionSupportResponse>(
    assignmentId
      ? `multimodal-interaction-support:assignment:${assignmentId}`
      : null,
    () =>
      fetchInteractionSupport(`assignmentId=${encodeURIComponent(assignmentId!)}`),
  );
}
