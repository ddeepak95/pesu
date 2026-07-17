import "server-only";

import { createServiceRoleClient } from "@/lib/supabase-server";
import { resolveInstitutionId } from "@/lib/logging/appLog";
import { getCachedResolveModelConfig } from "@/lib/ai/credentials/modelConfigCache";
import { resolveMultimodalSpeechModelsForClass } from "@/lib/konvo-voice/resolveMultimodalSpeechModelsForClass";
import { getModelEntry } from "@/lib/ai/catalog/helpers";
import { resolveSpeechKeySource } from "@/lib/ai/gateway";
import type { BotPromptConfig } from "@/types/assignment";
import type { AiConfigSource } from "@/types/aiSettings";
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
  countInstitutionByok: boolean;
  countClassByok: boolean;
}

export type WalletStatus =
  | { kind: "unrestricted" }
  | {
      kind: "wallet";
      walletId: string;
      enforcement: WalletEnforcement;
      balance: number;
      belowWarnThreshold: boolean;
      countInstitutionByok: boolean;
      countClassByok: boolean;
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

const WALLET_SELECT =
  "id, enforcement, soft_warn_threshold, count_institution_byok, count_class_byok";

function toResolvedInfo(
  walletRow: Record<string, unknown>,
  balance: number,
): ResolvedWalletInfo {
  return {
    walletId: walletRow.id as string,
    enforcement: walletRow.enforcement as WalletEnforcement,
    balance,
    softWarnThreshold: (walletRow.soft_warn_threshold as number | null) ?? null,
    countInstitutionByok: (walletRow.count_institution_byok as boolean | null) ?? true,
    countClassByok: (walletRow.count_class_byok as boolean | null) ?? false,
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
 * not call this for BYOK key sources — use resolveByokCapWalletId there.
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

/**
 * The class-cap wallet a BYOK call is counted against, or null when the class
 * has no active cap or the cap's matching count_*_byok flag is off (the
 * default — BYOK unmetered). Never the institution pool: BYOK is billed to
 * the key owner, so the cap only limits volume. A non-null result is the
 * signal completeAiInvocation uses to debit the class cap alone.
 */
export async function resolveByokCapWalletId(
  institutionId: string,
  classId: string | null,
  keySource: "institution" | "class",
): Promise<string | null> {
  if (!classId) return null;
  const service = createServiceRoleClient();
  const wallet = await resolveClassCapWallet(service, institutionId, classId);
  if (!wallet) return null;
  const counts =
    keySource === "institution" ? wallet.countInstitutionByok : wallet.countClassByok;
  return counts ? wallet.walletId : null;
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
    countInstitutionByok: wallet.countInstitutionByok,
    countClassByok: wallet.countClassByok,
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
 * warn-enforced/unrestricted levels never throw here. Platform-key calls
 * check both levels; BYOK calls counted by a class cap (count_*_byok) pass
 * includePool: false so only the cap gates — uncounted BYOK skips quota
 * entirely.
 */
export async function assertWithinQuota(
  input: QuotaScopeInput,
  opts: { includePool?: boolean } = {},
): Promise<void> {
  const status = await getQuotaStatus(input);
  const poolBlocked = (opts.includePool ?? true) && isBlocked(status.pool);
  if (isBlocked(status.classCap) || poolBlocked) {
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
 * multimodal_interaction config). Any platform-keyed surface gates the
 * session at both levels (class cap + institution pool). BYOK surfaces never
 * involve the pool, but gate the class cap when its matching count_*_byok
 * flag is on; with the flags off (default) an all-BYOK session is admitted
 * unconditionally.
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

  // Key source of every surface the session will use. Resolution stops once
  // a platform surface is found — that alone already forces full gating, so
  // the remaining surfaces' sources can't change the outcome.
  const sources = new Set<AiConfigSource>();
  let anyPlatform = false;

  // Chat LLM — always a surface for this session.
  const { keySource: llmKeySource } = await getCachedResolveModelConfig({
    classDbId: input.classDbId,
    appFunctionKey: "text.chat_tutoring",
  });
  sources.add(llmKeySource);
  if (!isByokSource(llmKeySource)) anyPlatform = true;

  const hasAudioInput = interaction?.input?.modes?.includes("audio") ?? false;
  const audioDelivery = interaction?.input?.audioDelivery ?? "transcribe";
  const speechMode = interaction?.output?.speechMode ?? "automatic";

  const needsStt = hasAudioInput && audioDelivery === "transcribe";
  const needsTts = speechMode !== "none";

  if (!anyPlatform && (needsStt || needsTts)) {
    const { sttModelId, ttsModelId } = await resolveMultimodalSpeechModelsForClass(
      input.classDbId,
    );

    if (needsStt) {
      const sttEntry = getModelEntry(sttModelId);
      if (sttEntry) {
        const keySource = await resolveSpeechKeySource(sttEntry.providerId, input.assignmentId);
        sources.add(keySource);
        if (!isByokSource(keySource)) anyPlatform = true;
      }
    }

    if (!anyPlatform && needsTts) {
      const ttsEntry = getModelEntry(ttsModelId);
      if (ttsEntry) {
        const keySource = await resolveSpeechKeySource(ttsEntry.providerId, input.assignmentId);
        sources.add(keySource);
        if (!isByokSource(keySource)) anyPlatform = true;
      }
    }
  }

  // The count_*_byok flags live on the class cap wallet, so status is read
  // even for all-BYOK sessions. The cap gates when any surface spends
  // platform credits OR uses a BYOK source the cap opted to count; the pool
  // gates only on platform spend (BYOK never touches it).
  const status = await getQuotaStatus({ institutionId, classId: input.classDbId });
  const cap = status.classCap;
  const capCountsByok =
    cap.kind === "wallet" &&
    ((cap.countInstitutionByok && sources.has("institution")) ||
      (cap.countClassByok && sources.has("class")));
  const capGates = anyPlatform || capCountsByok;

  // All surfaces BYOK and none of them counted -> fully unmetered session.
  if (!capGates) return { warnings: [] };

  if (isBlocked(cap) || (anyPlatform && isBlocked(status.pool))) {
    throw new QuotaExceededError();
  }

  const warnings: QuotaWarningLevel[] = [];
  if (anyPlatform && isWarning(status.pool)) warnings.push("institution");
  if (isWarning(cap)) warnings.push("class");
  return { warnings };
}
