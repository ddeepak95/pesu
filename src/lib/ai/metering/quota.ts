import "server-only";

import { createServiceRoleClient } from "@/lib/supabase-server";
import { resolveInstitutionId } from "@/lib/logging/appLog";
import { getCachedResolveModelConfig } from "@/lib/ai/credentials/modelConfigCache";
import { resolveMultimodalSpeechModelsForClass } from "@/lib/konvo-voice/resolveMultimodalSpeechModelsForClass";
import { getModelEntry } from "@/lib/ai/catalog/helpers";
import { resolveSpeechKeySource } from "@/lib/ai/gateway";
import type { BotPromptConfig } from "@/types/assignment";
import { QUOTA_EXCEEDED_ERROR_CODE } from "./constants";
import { keyOwnerFromSource, type KeyOwner } from "./keyOwner";

/**
 * dev-docs/ai-usage-metering-phase3-plan.md D11 — mirrors AiNotConfiguredError's
 * shape (src/lib/ai/credentials/resolve.ts).
 */
export class QuotaExceededError extends Error {
  readonly code = QUOTA_EXCEEDED_ERROR_CODE;

  constructor(message = "This class has run out of AI credits.") {
    super(message);
    this.name = "QuotaExceededError";
  }
}

/** Mirrors catalogNotConfiguredResponse (src/lib/ai/credentials/resolveCatalogConfig.ts). */
export function quotaExceededResponse(error: unknown) {
  if (error instanceof QuotaExceededError) {
    return {
      body: { error: error.message, code: error.code },
      status: 402 as const,
    };
  }
  return null;
}

export type WalletEnforcement = "off" | "warn" | "block";

interface ResolvedWalletInfo {
  walletId: string;
  enforcement: WalletEnforcement;
  balance: number;
  softWarnThreshold: number | null;
}

export type QuotaStatus =
  | { kind: "unrestricted" }
  | {
      kind: "wallet";
      walletId: string;
      enforcement: WalletEnforcement;
      balance: number;
      belowWarnThreshold: boolean;
    };

export interface QuotaScopeInput {
  institutionId: string;
  classId: string | null;
  keyOwner: KeyOwner;
}

/**
 * Most-specific-first lookup (D5, D6 step 2): the class-level wallet for this
 * institution+key_owner if one exists, else the institution-level wallet, else
 * no wallet at all (unrestricted). No wallet row is treated identically to
 * `enforcement = 'off'` on an existing one.
 */
async function resolveWallet(
  service: ReturnType<typeof createServiceRoleClient>,
  input: QuotaScopeInput,
): Promise<ResolvedWalletInfo | null> {
  const baseSelect = "id, enforcement, soft_warn_threshold";

  let walletRow: Record<string, unknown> | null = null;

  if (input.classId) {
    const { data } = await service
      .from("ai_credit_wallets")
      .select(baseSelect)
      .eq("institution_id", input.institutionId)
      .eq("class_id", input.classId)
      .eq("key_owner", input.keyOwner)
      .maybeSingle();
    walletRow = data as Record<string, unknown> | null;
  }

  if (!walletRow) {
    const { data } = await service
      .from("ai_credit_wallets")
      .select(baseSelect)
      .eq("institution_id", input.institutionId)
      .is("class_id", null)
      .eq("key_owner", input.keyOwner)
      .maybeSingle();
    walletRow = data as Record<string, unknown> | null;
  }

  if (!walletRow) return null;

  const walletId = walletRow.id as string;

  const { data: balanceRow } = await service
    .from("ai_credit_balances")
    .select("balance")
    .eq("wallet_id", walletId)
    .maybeSingle();

  return {
    walletId,
    enforcement: walletRow.enforcement as WalletEnforcement,
    balance: (balanceRow?.balance as number | undefined) ?? 0,
    softWarnThreshold: (walletRow.soft_warn_threshold as number | null) ?? null,
  };
}

/**
 * Resolves the wallet id a call should be attributed to, independent of
 * whether its balance is checked (D2 gateway step: the debit needs a
 * wallet_id regardless of the admission decision). Returns null when no
 * wallet exists for this scope (D5) — the invocation is simply left
 * unattributed to any wallet.
 */
export async function resolveWalletId(input: QuotaScopeInput): Promise<string | null> {
  const service = createServiceRoleClient();
  const wallet = await resolveWallet(service, input);
  return wallet?.walletId ?? null;
}

/** Read path for the quota-status endpoint (§9) and the checks below. */
export async function getQuotaStatus(input: QuotaScopeInput): Promise<QuotaStatus> {
  const service = createServiceRoleClient();
  const wallet = await resolveWallet(service, input);
  if (!wallet) return { kind: "unrestricted" };
  return {
    kind: "wallet",
    walletId: wallet.walletId,
    enforcement: wallet.enforcement,
    balance: wallet.balance,
    belowWarnThreshold:
      wallet.softWarnThreshold != null && wallet.balance <= wallet.softWarnThreshold,
  };
}

/**
 * Per-call check for genuine one-shots (D6 gateway step 3). Throws before any
 * provider credential is touched or row is written when the resolved wallet
 * is block-enforced and exhausted (balance <= 0). warn-enforced/unrestricted
 * wallets never throw here.
 */
export async function assertWithinQuota(input: QuotaScopeInput): Promise<void> {
  const status = await getQuotaStatus(input);
  if (status.kind === "wallet" && status.enforcement === "block" && status.balance <= 0) {
    throw new QuotaExceededError();
  }
}

export interface AssertSessionCanStartInput {
  classDbId: string;
  assignmentId: string;
}

export interface AssertSessionCanStartResult {
  /** key_owners whose wallet is warn-enforced and below its soft threshold. */
  warnings: KeyOwner[];
}

/**
 * Session-start admission (D6) — the single per-session quota gate, run once
 * from attempt-start before any AI call. Enumerates every AI surface the
 * session will use (chat LLM always; STT/TTS depending on the assignment's
 * multimodal_interaction config), resolves each to its key_owner, and blocks
 * the whole session if any distinct wallet in play is block-enforced and
 * exhausted — not just the chat LLM's wallet.
 */
export async function assertSessionCanStart(
  input: AssertSessionCanStartInput,
): Promise<AssertSessionCanStartResult> {
  const service = createServiceRoleClient();
  const institutionId = await resolveInstitutionId(service, input.classDbId);
  // No institution resolvable for this class -> nothing to gate (D5 spirit:
  // no wallet can ever exist for a scope with no institution).
  if (!institutionId) return { warnings: [] };

  const { data: assignmentRow } = await service
    .from("assignments")
    .select("bot_prompt_config")
    .eq("assignment_id", input.assignmentId)
    .maybeSingle();
  const interaction = (assignmentRow?.bot_prompt_config as BotPromptConfig | null)
    ?.multimodal_interaction;

  const keyOwners = new Set<KeyOwner>();

  // Chat LLM — always a surface for this session.
  const { keySource: llmKeySource } = await getCachedResolveModelConfig({
    classDbId: input.classDbId,
    appFunctionKey: "text.chat_tutoring",
  });
  keyOwners.add(keyOwnerFromSource(llmKeySource));

  const hasAudioInput = interaction?.input?.modes?.includes("audio") ?? false;
  const audioDelivery = interaction?.input?.audioDelivery ?? "transcribe";
  const speechMode = interaction?.output?.speechMode ?? "automatic";

  const needsStt = hasAudioInput && audioDelivery === "transcribe";
  const needsTts = speechMode !== "none";

  if (needsStt || needsTts) {
    const { sttModelId, ttsModelId } = await resolveMultimodalSpeechModelsForClass(
      input.classDbId,
    );

    if (needsStt) {
      const sttEntry = getModelEntry(sttModelId);
      if (sttEntry) {
        const keySource = await resolveSpeechKeySource(sttEntry.providerId, input.assignmentId);
        keyOwners.add(keyOwnerFromSource(keySource));
      }
    }

    if (needsTts) {
      const ttsEntry = getModelEntry(ttsModelId);
      if (ttsEntry) {
        const keySource = await resolveSpeechKeySource(ttsEntry.providerId, input.assignmentId);
        keyOwners.add(keyOwnerFromSource(keySource));
      }
    }
  }

  const warnings: KeyOwner[] = [];
  for (const keyOwner of keyOwners) {
    const status = await getQuotaStatus({ institutionId, classId: input.classDbId, keyOwner });
    if (status.kind !== "wallet") continue;
    if (status.enforcement === "block" && status.balance <= 0) {
      throw new QuotaExceededError();
    }
    if (status.enforcement === "warn" && status.belowWarnThreshold) {
      warnings.push(keyOwner);
    }
  }

  return { warnings };
}
