"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireInstitutionAdminOrSuper } from "@/lib/dal";
import {
  allocateWalletCredits,
  createWallet,
  setDefaultClassWalletCredits,
  setSelfManageEnabled,
  updateWalletPolicy,
  type WalletEnforcement,
  type WalletKeyOwner,
} from "@/lib/queries/aiCreditWallets";

/**
 * Wallet funding/policy writes (dev-docs/ai-usage-metering-phase3-plan.md D9)
 * — always through the acting user's own Supabase client (requireInstitutionAdminOrSuper),
 * never service-role, so auth.uid()-based RLS/trigger checks and audit
 * `changed_by` attribution resolve correctly. The same action serves both
 * /admin/institutions/[id]/wallets (institution admin) and
 * /platform/institutions/[id]/wallets (super admin) — Postgres, not this
 * route, is the actual permission authority.
 */

function formString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function formNumberOrNull(formData: FormData, key: string): number | null {
  const raw = formString(formData, key);
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildNoticeUrl(basePath: string, status: { ok: string } | { error: string }): string {
  const params = new URLSearchParams();
  if ("ok" in status) params.set("ok", status.ok);
  else params.set("error", status.error);
  return `${basePath}?${params.toString()}`;
}

function walletsPath(basePath: "admin" | "platform", institutionId: string): string {
  return `/${basePath}/institutions/${institutionId}/wallets`;
}

async function revalidateBoth(institutionId: string): Promise<void> {
  revalidatePath(walletsPath("admin", institutionId));
  revalidatePath(walletsPath("platform", institutionId));
}

export async function createWalletAction(formData: FormData): Promise<void> {
  const institutionId = formString(formData, "institutionId");
  const classId = formString(formData, "classId") || null;
  const keyOwner = formString(formData, "keyOwner") as WalletKeyOwner;
  const basePath = (formString(formData, "basePath") as "admin" | "platform") || "admin";
  const detailPath = walletsPath(basePath, institutionId);

  const { supabase } = await requireInstitutionAdminOrSuper(institutionId);

  let errorMessage: string | null = null;
  try {
    await createWallet(supabase, { institutionId, classId, keyOwner });
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
  }
  if (errorMessage) {
    redirect(buildNoticeUrl(detailPath, { error: errorMessage }));
  }

  await revalidateBoth(institutionId);
  redirect(buildNoticeUrl(detailPath, { ok: "Wallet created" }));
}

export async function updateWalletPolicyAction(formData: FormData): Promise<void> {
  const institutionId = formString(formData, "institutionId");
  const walletId = formString(formData, "walletId");
  const basePath = (formString(formData, "basePath") as "admin" | "platform") || "admin";
  const detailPath = walletsPath(basePath, institutionId);
  const enforcement = formString(formData, "enforcement") as WalletEnforcement;

  const { supabase } = await requireInstitutionAdminOrSuper(institutionId);

  let errorMessage: string | null = null;
  try {
    await updateWalletPolicy(supabase, {
      walletId,
      enforcement,
      maxBalance: formNumberOrNull(formData, "maxBalance"),
      softWarnThreshold: formNumberOrNull(formData, "softWarnThreshold"),
      classAllocationCapacity: formNumberOrNull(formData, "classAllocationCapacity"),
    });
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
  }
  if (errorMessage) {
    redirect(buildNoticeUrl(detailPath, { error: errorMessage }));
  }

  await revalidateBoth(institutionId);
  redirect(buildNoticeUrl(detailPath, { ok: "Wallet policy updated" }));
}

export async function allocateCreditsAction(formData: FormData): Promise<void> {
  const institutionId = formString(formData, "institutionId");
  const walletId = formString(formData, "walletId");
  const basePath = (formString(formData, "basePath") as "admin" | "platform") || "admin";
  const detailPath = walletsPath(basePath, institutionId);
  const credits = Number(formString(formData, "credits"));
  const note = formString(formData, "note") || null;

  const { supabase } = await requireInstitutionAdminOrSuper(institutionId);

  if (!Number.isFinite(credits) || credits <= 0) {
    redirect(buildNoticeUrl(detailPath, { error: "Credits must be a positive number" }));
  }

  let errorMessage: string | null = null;
  try {
    await allocateWalletCredits(supabase, { walletId, credits, note });
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
  }
  if (errorMessage) {
    redirect(buildNoticeUrl(detailPath, { error: errorMessage }));
  }

  await revalidateBoth(institutionId);
  redirect(buildNoticeUrl(detailPath, { ok: `${credits} credits allocated` }));
}

export async function setDefaultClassWalletCreditsAction(formData: FormData): Promise<void> {
  const institutionId = formString(formData, "institutionId");
  const basePath = (formString(formData, "basePath") as "admin" | "platform") || "admin";
  const detailPath = walletsPath(basePath, institutionId);
  const credits = formNumberOrNull(formData, "defaultClassWalletCredits");

  const { supabase } = await requireInstitutionAdminOrSuper(institutionId);

  let errorMessage: string | null = null;
  try {
    await setDefaultClassWalletCredits(supabase, { institutionId, credits });
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
  }
  if (errorMessage) {
    redirect(buildNoticeUrl(detailPath, { error: errorMessage }));
  }

  await revalidateBoth(institutionId);
  redirect(
    buildNoticeUrl(detailPath, {
      ok:
        credits == null
          ? "New classes will now be created unbounded (unmetered)"
          : `New classes will now be created with ${credits} credits`,
    }),
  );
}

/**
 * Super-admin-only in practice (the ai_credit_wallets_enforce_locks_and_audit_trg
 * trigger rejects a non-super-admin's attempt to change this field), but this
 * action itself is reachable from either institution-scoped route — Postgres
 * is the actual authority (D9, D10).
 */
export async function setSelfManageEnabledAction(formData: FormData): Promise<void> {
  const institutionId = formString(formData, "institutionId");
  const walletId = formString(formData, "walletId");
  const basePath = (formString(formData, "basePath") as "admin" | "platform") || "platform";
  const detailPath = walletsPath(basePath, institutionId);
  const selfManageEnabled = formString(formData, "selfManageEnabled") === "true";

  const { supabase } = await requireInstitutionAdminOrSuper(institutionId);

  let errorMessage: string | null = null;
  try {
    await setSelfManageEnabled(supabase, { walletId, selfManageEnabled });
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
  }
  if (errorMessage) {
    redirect(buildNoticeUrl(detailPath, { error: errorMessage }));
  }

  await revalidateBoth(institutionId);
  redirect(
    buildNoticeUrl(detailPath, {
      ok: selfManageEnabled ? "Self-service enabled" : "Self-service disabled",
    }),
  );
}
