import "server-only";

import { getInstitutionAiPolicy } from "@/lib/queries/aiInstitutionSettings";
import { getClassAiAccessEnabled } from "@/lib/queries/aiClassSettings";
import { createServiceRoleClient } from "@/lib/supabase-server";
import { AI_ACCESS_DISABLED_ERROR_CODE } from "./constants";

/**
 * dev-docs/ai-usage-metering-phase4-plan.md decision 1 — mirrors
 * QuotaExceededError's shape (src/lib/ai/metering/quota.ts), but this is a
 * distinct denial reason: an admin explicitly switched AI access off,
 * independent of any wallet balance.
 */
export class AiAccessDisabledError extends Error {
  readonly code = AI_ACCESS_DISABLED_ERROR_CODE;

  constructor(message = "AI access has been turned off for this class or institution.") {
    super(message);
    this.name = "AiAccessDisabledError";
  }
}

/** Mirrors quotaExceededResponse (src/lib/ai/metering/quota.ts). */
export function aiAccessDisabledResponse(error: unknown) {
  if (error instanceof AiAccessDisabledError) {
    return {
      body: { error: error.message, code: error.code },
      status: 403 as const,
    };
  }
  return null;
}

/**
 * Real-time kill switch for platform-keyed AI calls — checked at every
 * gateway handle resolution (resolveMeteredModel / resolveMeteredSpeech),
 * not just at provider-activation config time. Only relevant when the call
 * is actually spending platform credits (keyOwner === 'platform'); an
 * institution's own BYOK key isn't gated by "allow platform credits".
 */
export async function assertPlatformAiAccessAllowed(institutionId: string): Promise<void> {
  const service = createServiceRoleClient();
  const institutionPolicy = await getInstitutionAiPolicy(service, institutionId);
  if (!institutionPolicy.allowUsePlatformDefaults) {
    throw new AiAccessDisabledError(
      "This institution's platform AI access is turned off.",
    );
  }
}

/**
 * Real-time kill switch for a class inheriting the institution's AI setup —
 * whether that's the institution's platform credits or the institution's own
 * BYOK key. Checked whenever the resolved keySource isn't 'class' (i.e. the
 * class hasn't configured its own key); a class's own key is never gated by
 * this, since it doesn't depend on the institution at all.
 */
export async function assertClassAiAccessAllowed(classDbId: string): Promise<void> {
  const service = createServiceRoleClient();
  const classAccessEnabled = await getClassAiAccessEnabled(service, classDbId);
  if (!classAccessEnabled) {
    throw new AiAccessDisabledError("AI access is turned off for this class.");
  }
}
