import "server-only";

import { resolveInteractionSupportForClass } from "@/lib/multimodal/resolveInteractionSupport";

/**
 * Whether the class's currently-bound text.chat_tutoring model supports direct
 * audio input (the `audio_input` ModelTask). Gates the "direct audio input"
 * teacher toggle. See dev-docs/multimodal-interaction-config-plan.md §3g.
 *
 * Thin wrapper over resolveInteractionSupportForClass, kept for the callers that
 * only need the direct-audio signal.
 */
export async function resolveAudioInputSupportForClass(
  classDbId: string,
): Promise<boolean> {
  const { audioInputSupported } =
    await resolveInteractionSupportForClass(classDbId);
  return audioInputSupported;
}
