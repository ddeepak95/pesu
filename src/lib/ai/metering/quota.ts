import "server-only";

import { createServiceRoleClient } from "@/lib/supabase-server";
import { resolveInstitutionId } from "@/lib/logging/appLog";
import { getCachedResolveModelConfig } from "@/lib/ai/credentials/modelConfigCache";
import { resolveMultimodalSpeechModelsForClass } from "@/lib/konvo-voice/resolveMultimodalSpeechModelsForClass";
import { getModelEntry } from "@/lib/ai/catalog/helpers";
import { resolveSpeechKeySource } from "@/lib/ai/gateway";
import type { BotPromptConfig } from "@/types/assignment";
import { QUOTA_EXCEEDED_ERROR_CODE } from "./constants";
import { isByokSource } from "./keyOwner";

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

export type WalletStatus =
  | { kind: "unrestricted" }
  | {
      kind: "wallet";
      walletId: string;
      enforcement: WalletEnforcement;
      balance: number;
      belowWarnThreshold: boolean;
    };

/**
 * Dual-debit cap model (product decision 2026-07-16): platform-key usage is
 * gated at two levels at once — the institution pool (the only real money)
 * and, when the class has one, the class's own spending cap.
 */
export interface QuotaStatus {
  pool: WalletStatus;
  classCap: WalletStatus;
}

export interface QuotaScopeInput {
  institutionId: string;
  classId: string | null;
}

async function loadBalance(
  service: ReturnType<typeof createServiceRoleClient>,
  walletId: string,
): Promise<number> {
  const { data } = await service
    .from("ai_credit_balances")
    .select("balance")
    .eq("wallet_id", walletId)
    .maybeSingle();
  return (data?.balance as number | undefined) ?? 0;
}

const WALLET_SELECT = "id, enforcement, soft_warn_threshold";

function toResolvedInfo(
  walletRow: Record<string, unknown>,
  balance: number,
): ResolvedWalletInfo {
  return {
    walletId: walletRow.id as string,
    enforcement: walletRow.enforcement as WalletEnforcement,
    balance,
    softWarnThreshold: (walletRow.soft_warn_threshold as number | null) ?? null,
  };
}

/**
 * The class's spending cap, if it has an active one. An `enforcement = 'off'`
 * row means "no cap" and is treated identically to no row at all — such a
 * class draws from the institution pool alone (which is debited and gated
 * regardless).
 */
async function resolveClassCapWallet(
  service: ReturnType<typeof createServiceRoleClient>,
  institutionId: string,
  classId: string,
): Promise<ResolvedWalletInfo | null> {
  const { data } = await service
    .from("ai_credit_wallets")
    .select(WALLET_SELECT)
    .eq("institution_id", institutionId)
    .eq("class_id", classId)
    .neq("enforcement", "off")
    .maybeSingle();
  if (!data) return null;
  const row = data as Record<string, unknown>;
  return toResolvedInfo(row, await loadBalance(service, row.id as string));
}

/** The institution's credit pool — the only wallet holding real money. */
async function resolveInstitutionPoolWallet(
  service: ReturnType<typeof createServiceRoleClient>,
  institutionId: string,
): Promise<ResolvedWalletInfo | null> {
  const { data } = await service
    .from("ai_credit_wallets")
    .select(WALLET_SELECT)
    .eq("institution_id", institutionId)
    .is("class_id", null)
    .maybeSingle();
  if (!data) return null;
  const row = data as Record<string, unknown>;
  return toResolvedInfo(row, await loadBalance(service, row.id as string));
}

/**
 * Resolves the class-cap wallet id a platform-key call should be attributed
 * to (D2 gateway step: the debit needs it regardless of the admission
 * decision). Returns null when the class has no active cap — the invocation's
 * wallet_id stays null and only the institution pool is debited (which
 * debit_usage_wallets resolves by institution_id on its own). Callers must
 * not call this for BYOK key sources at all (BYOK is unmetered).
 */
export async function resolveCapWalletId(
  institutionId: string,
  classId: string | null,
): Promise<string | null> {
  if (!classId) return null;
  const service = createServiceRoleClient();
  const wallet = await resolveClassCapWallet(service, institutionId, classId);
  return wallet?.walletId ?? null;
}

function toStatus(wallet: ResolvedWalletInfo | null): WalletStatus {
  if (!wallet || wallet.enforcement === "off") return { kind: "unrestricted" };
  return {
    kind: "wallet",
    walletId: wallet.walletId,
    enforcement: wallet.enforcement,
    balance: wallet.balance,
    belowWarnThreshold:
      wallet.softWarnThreshold != null && wallet.balance <= wallet.softWarnThreshold,
  };
}

/** Read path for the quota-status endpoint (§9) and the checks below. */
export async function getQuotaStatus(input: QuotaScopeInput): Promise<QuotaStatus> {
  const service = createServiceRoleClient();
  const [pool, classCap] = await Promise.all([
    resolveInstitutionPoolWallet(service, input.institutionId),
    input.classId
      ? resolveClassCapWallet(service, input.institutionId, input.classId)
      : Promise.resolve(null),
  ]);
  return { pool: toStatus(pool), classCap: toStatus(classCap) };
}

function isBlocked(status: WalletStatus): boolean {
  return status.kind === "wallet" && status.enforcement === "block" && status.balance <= 0;
}

function isWarning(status: WalletStatus): boolean {
  return status.kind === "wallet" && status.enforcement === "warn" && status.belowWarnThreshold;
}

/**
 * Per-call check for genuine one-shots (D6 gateway step 3). Throws before any
 * provider credential is touched or row is written when either the class cap
 * or the institution pool is block-enforced and exhausted (balance <= 0).
 * warn-enforced/unrestricted levels never throw here. Only meaningful for
 * platform-key calls — BYOK callers must skip quota entirely.
 */
export async function assertWithinQuota(input: QuotaScopeInput): Promise<void> {
  const status = await getQuotaStatus(input);
  if (isBlocked(status.classCap) || isBlocked(status.pool)) {
    throw new QuotaExceededError();
  }
}

export interface AssertSessionCanStartInput {
  classDbId: string;
  assignmentId: string;
}

/** Which gating level is warn-enforced and below its soft threshold. */
export type QuotaWarningLevel = "institution" | "class";

export interface AssertSessionCanStartResult {
  warnings: QuotaWarningLevel[];
}

/**
 * Session-start admission (D6) — the single per-session quota gate, run once
 * from attempt-start before any AI call. Enumerates every AI surface the
 * session will use (chat LLM always; STT/TTS depending on the assignment's
 * multimodal_interaction config). BYOK surfaces (institution/class own key)
 * are unmetered and skipped; if any surface spends platform credits, the
 * session is blocked when either the class cap or the institution pool is
 * block-enforced and exhausted.
 */
export async function assertSessionCanStart(
  input: AssertSessionCanStartInput,
): Promise<AssertSessionCanStartResult> {
  const service = createServiceRoleClient();
  const institutionId = await resolveInstitutionId(service, input.classDbId);
  // No institution resolvable for this class -> nothing to gate (no wallet
  // can ever exist for a scope with no institution).
  if (!institutionId) return { warnings: [] };

  const { data: assignmentRow } = await service
    .from("assignments")
    .select("bot_prompt_config")
    .eq("assignment_id", input.assignmentId)
    .maybeSingle();
  const interaction = (assignmentRow?.bot_prompt_config as BotPromptConfig | null)
    ?.multimodal_interaction;

  let usesPlatformCredits = false;

  // Chat LLM — always a surface for this session.
  const { keySource: llmKeySource } = await getCachedResolveModelConfig({
    classDbId: input.classDbId,
    appFunctionKey: "text.chat_tutoring",
  });
  if (!isByokSource(llmKeySource)) usesPlatformCredits = true;

  const hasAudioInput = interaction?.input?.modes?.includes("audio") ?? false;
  const audioDelivery = interaction?.input?.audioDelivery ?? "transcribe";
  const speechMode = interaction?.output?.speechMode ?? "automatic";

  const needsStt = hasAudioInput && audioDelivery === "transcribe";
  const needsTts = speechMode !== "none";

  if (!usesPlatformCredits && (needsStt || needsTts)) {
    const { sttModelId, ttsModelId } = await resolveMultimodalSpeechModelsForClass(
      input.classDbId,
    );

    if (needsStt) {
      const sttEntry = getModelEntry(sttModelId);
      if (sttEntry) {
        const keySource = await resolveSpeechKeySource(sttEntry.providerId, input.assignmentId);
        if (!isByokSource(keySource)) usesPlatformCredits = true;
      }
    }

    if (!usesPlatformCredits && needsTts) {
      const ttsEntry = getModelEntry(ttsModelId);
      if (ttsEntry) {
        const keySource = await resolveSpeechKeySource(ttsEntry.providerId, input.assignmentId);
        if (!isByokSource(keySource)) usesPlatformCredits = true;
      }
    }
  }

  // All surfaces BYOK -> fully unmetered session, nothing to gate.
  if (!usesPlatformCredits) return { warnings: [] };

  const status = await getQuotaStatus({ institutionId, classId: input.classDbId });
  if (isBlocked(status.classCap) || isBlocked(status.pool)) {
    throw new QuotaExceededError();
  }

  const warnings: QuotaWarningLevel[] = [];
  if (isWarning(status.pool)) warnings.push("institution");
  if (isWarning(status.classCap)) warnings.push("class");
  return { warnings };
}
