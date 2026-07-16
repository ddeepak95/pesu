"use server";

import { revalidatePath } from "next/cache";

import { requireInstitutionAdminOrSuper, verifySession } from "@/lib/dal";
import { resolveClassSettingsViewer } from "@/lib/settings/classViewerRole";
import { setClassAiAccessEnabled } from "@/lib/queries/aiClassSettings";
import {
  allocateWalletCredits,
  createWallet,
  setDefaultClassWalletCredits,
  updateWalletPolicy,
  type AiCreditWallet,
  type WalletEnforcement,
  type WalletKeyOwner,
} from "@/lib/queries/aiCreditWallets";
import {
  getMonthlyUsageByModality,
  type UsageBreakdownRow,
} from "@/lib/queries/aiUsage";

/**
 * Wallet funding/policy writes (dev-docs/ai-usage-metering-phase3-plan.md
 * D9) — always through the acting user's own Supabase client
 * (requireInstitutionAdminOrSuper), never service-role, so auth.uid()-based
 * RLS/trigger checks and audit `changed_by` attribution work. Non-redirecting
 * (unlike the original src/app/admin/institutions/[id]/wallets/actions.ts):
 * these are called from an interactive client component (AiAccessAndLimitCard
 * inside AiManagementPanels), which needs a result to update local state with
 * rather than a full-page redirect.
 */
export interface WalletActionResult {
  ok: boolean;
  error?: string;
}

function ok(): WalletActionResult {
  return { ok: true };
}

function fail(err: unknown): WalletActionResult {
  if (err instanceof Error) {
    return { ok: false, error: err.message };
  }
  // Supabase/Postgrest errors are plain objects ({message, code, details,
  // hint}), not Error instances — String(err) on those yields "[object
  // Object]" instead of anything useful.
  if (
    err &&
    typeof err === "object" &&
    "message" in err &&
    typeof (err as { message: unknown }).message === "string"
  ) {
    return { ok: false, error: (err as { message: string }).message };
  }
  return { ok: false, error: String(err) };
}

function revalidateInstitutionAiTab(institutionId: string): void {
  revalidatePath(`/admin/institutions/${institutionId}`);
  revalidatePath(`/platform/institutions/${institutionId}`);
}

function revalidateClassAiTab(institutionId: string, classDbId: string, classShortId?: string | null): void {
  revalidatePath(`/admin/institutions/${institutionId}/classes/${classDbId}`);
  revalidatePath(`/platform/institutions/${institutionId}/classes/${classDbId}`);
  if (classShortId) {
    revalidatePath(`/teacher/classes/${classShortId}/settings`);
  }
}

export interface CreateWalletActionResult extends WalletActionResult {
  wallet?: AiCreditWallet;
}

/**
 * Auto-creates a wallet the first time one is actually needed (e.g. the
 * admin switches Credit Limits to "Limited") — there is no standalone
 * "Create wallet" UI step; D5 already treats "no wallet" as unrestricted, so
 * a wallet only needs to exist once someone wants to cap or fund it.
 */
export async function createWalletResultAction(input: {
  institutionId: string;
  classId: string | null;
  keyOwner: WalletKeyOwner;
  enforcement?: WalletEnforcement;
  classShortId?: string | null;
}): Promise<CreateWalletActionResult> {
  const { supabase } = await requireInstitutionAdminOrSuper(input.institutionId);
  let wallet: AiCreditWallet;
  try {
    wallet = await createWallet(supabase, {
      institutionId: input.institutionId,
      classId: input.classId,
      keyOwner: input.keyOwner,
      enforcement: input.enforcement,
    });
  } catch (err) {
    return fail(err);
  }
  if (input.classId) {
    revalidateClassAiTab(input.institutionId, input.classId, input.classShortId);
  } else {
    revalidateInstitutionAiTab(input.institutionId);
  }
  return { ok: true, wallet };
}

export async function updateWalletPolicyResultAction(input: {
  institutionId: string;
  walletId: string;
  enforcement: WalletEnforcement;
  maxBalance: number | null;
  softWarnThreshold: number | null;
  classAllocationCapacity: number | null;
  classId?: string | null;
  classShortId?: string | null;
}): Promise<WalletActionResult> {
  const { supabase } = await requireInstitutionAdminOrSuper(input.institutionId);
  try {
    await updateWalletPolicy(supabase, {
      walletId: input.walletId,
      enforcement: input.enforcement,
      maxBalance: input.maxBalance,
      softWarnThreshold: input.softWarnThreshold,
      classAllocationCapacity: input.classAllocationCapacity,
    });
  } catch (err) {
    return fail(err);
  }
  if (input.classId) {
    revalidateClassAiTab(input.institutionId, input.classId, input.classShortId);
  } else {
    revalidateInstitutionAiTab(input.institutionId);
  }
  return ok();
}

export async function allocateCreditsResultAction(input: {
  institutionId: string;
  walletId: string;
  /** Positive to add, negative to reduce — the balance is a running ledger sum, not a fixed value. */
  credits: number;
  note: string | null;
  classId?: string | null;
  classShortId?: string | null;
}): Promise<WalletActionResult> {
  if (!Number.isFinite(input.credits) || input.credits === 0) {
    return fail(new Error("Amount must be a non-zero number"));
  }
  const { supabase } = await requireInstitutionAdminOrSuper(input.institutionId);
  try {
    await allocateWalletCredits(supabase, {
      walletId: input.walletId,
      credits: input.credits,
      note: input.note,
    });
  } catch (err) {
    return fail(err);
  }
  if (input.classId) {
    revalidateClassAiTab(input.institutionId, input.classId, input.classShortId);
  } else {
    revalidateInstitutionAiTab(input.institutionId);
  }
  return ok();
}

export async function setDefaultClassWalletCreditsResultAction(input: {
  institutionId: string;
  credits: number | null;
}): Promise<WalletActionResult> {
  const { supabase } = await requireInstitutionAdminOrSuper(input.institutionId);
  try {
    await setDefaultClassWalletCredits(supabase, {
      institutionId: input.institutionId,
      credits: input.credits,
    });
  } catch (err) {
    return fail(err);
  }
  revalidateInstitutionAiTab(input.institutionId);
  return ok();
}

/**
 * The class-level AI access kill switch (decision 1) — mirrors
 * setClassAiOverrideAction's shape (src/lib/ai/credentials/actions.ts) but
 * for `ai_access_enabled` instead of `allow_child_override`. Restricted to
 * institution admins and super admins (same authority as every other
 * ai_class_settings write) — a regular teacher cannot flip this even if they
 * have AI-override rights.
 */
export async function setClassAiAccessEnabledAction(input: {
  classDbId: string;
  classShortId?: string | null;
  enabled: boolean;
}): Promise<WalletActionResult> {
  try {
    const { user, supabase } = await verifySession();
    const { viewerRole, institutionId } = await resolveClassSettingsViewer(
      supabase,
      user.id,
      input.classDbId,
    );
    if (viewerRole !== "institution_admin" && viewerRole !== "super_admin") {
      return fail(new Error("Only institution admins may change class AI access"));
    }
    await setClassAiAccessEnabled(supabase, input.classDbId, input.enabled, user.id);
    revalidateClassAiTab(institutionId, input.classDbId, input.classShortId);
    return ok();
  } catch (err) {
    return fail(err);
  }
}

export interface UsageForMonthActionResult extends WalletActionResult {
  breakdown?: UsageBreakdownRow[];
}

/**
 * Backs the Analytics and Logs tab's month picker (UsageOverview) — a plain
 * read, so authorization is just "has a session"; RLS on ai_usage_counters
 * (super admin / institution admin / class teacher-admin) does the actual
 * scoping, same as every other reader of this table.
 */
export async function getUsageForMonthAction(input: {
  institutionId: string;
  classId?: string | null;
  periodStart: string;
}): Promise<UsageForMonthActionResult> {
  try {
    const { supabase } = await verifySession();
    const breakdown = await getMonthlyUsageByModality(supabase, {
      institutionId: input.institutionId,
      classId: input.classId ?? null,
      periodStart: input.periodStart,
    });
    return { ok: true, breakdown };
  } catch (err) {
    return fail(err);
  }
}
