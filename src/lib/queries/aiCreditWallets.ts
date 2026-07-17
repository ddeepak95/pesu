import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type WalletEnforcement = "off" | "warn" | "block";

/**
 * Dual-debit cap model: an institution-level row (class_id null) is the
 * institution's credit pool — the only real money; its balance is debited by
 * every platform-key invocation under the institution. A class-level row is a
 * spending cap; its balance is the class's remaining allowance, debited in
 * lockstep with the pool. BYOK usage has no wallet at all.
 */
export interface AiCreditWallet {
  id: string;
  institution_id: string;
  class_id: string | null;
  monthly_grant: number | null;
  max_balance: number | null;
  soft_warn_threshold: number | null;
  enforcement: WalletEnforcement;
  self_manage_enabled: boolean;
  updated_at: string;
  balance: number;
}

const WALLET_COLUMNS =
  "id, institution_id, class_id, monthly_grant, max_balance, soft_warn_threshold, enforcement, self_manage_enabled, updated_at";

async function attachBalances(
  supabase: SupabaseClient,
  rows: Record<string, unknown>[],
): Promise<AiCreditWallet[]> {
  if (rows.length === 0) return [];

  const { data: balances, error: balanceError } = await supabase
    .from("ai_credit_balances")
    .select("wallet_id, balance")
    .in(
      "wallet_id",
      rows.map((w) => w.id as string),
    );
  if (balanceError) throw balanceError;

  const balanceByWallet = new Map<string, number>(
    (balances ?? []).map((b) => [b.wallet_id as string, Number(b.balance)]),
  );

  return rows.map((w) => ({
    ...(w as Omit<AiCreditWallet, "balance">),
    balance: balanceByWallet.get(w.id as string) ?? 0,
  })) as AiCreditWallet[];
}

/**
 * All wallets under an institution (institution-level + every class-level
 * row), with balance joined in from ai_credit_balances (0 when never funded).
 * RLS on both tables already scopes this to the viewer's institution.
 */
export async function listWalletsForInstitution(
  supabase: SupabaseClient,
  institutionId: string,
): Promise<AiCreditWallet[]> {
  const { data: wallets, error } = await supabase
    .from("ai_credit_wallets")
    .select(WALLET_COLUMNS)
    .eq("institution_id", institutionId);
  if (error) throw error;
  return attachBalances(supabase, wallets ?? []);
}

/** Just one class's own cap wallet (0-1 rows) — the class settings AI tab doesn't need the whole institution's list. */
export async function listWalletsForClass(
  supabase: SupabaseClient,
  classId: string,
): Promise<AiCreditWallet[]> {
  const { data: wallets, error } = await supabase
    .from("ai_credit_wallets")
    .select(WALLET_COLUMNS)
    .eq("class_id", classId);
  if (error) throw error;
  return attachBalances(supabase, wallets ?? []);
}

/** Returns the created row (balance always 0 — a brand new wallet has no transactions yet). */
export async function createWallet(
  supabase: SupabaseClient,
  input: {
    institutionId: string;
    classId: string | null;
    /** Defaults to the column default ('off'/Unbounded) when omitted. */
    enforcement?: WalletEnforcement;
  },
): Promise<AiCreditWallet> {
  const { data, error } = await supabase
    .from("ai_credit_wallets")
    .insert({
      institution_id: input.institutionId,
      class_id: input.classId,
      ...(input.enforcement ? { enforcement: input.enforcement } : {}),
    })
    .select(WALLET_COLUMNS)
    .single();
  if (error) throw error;
  return { ...(data as Omit<AiCreditWallet, "balance">), balance: 0 };
}

export async function updateWalletPolicy(
  supabase: SupabaseClient,
  input: {
    walletId: string;
    enforcement: WalletEnforcement;
    maxBalance: number | null;
    softWarnThreshold: number | null;
  },
): Promise<void> {
  const { error } = await supabase
    .from("ai_credit_wallets")
    .update({
      enforcement: input.enforcement,
      max_balance: input.maxBalance,
      soft_warn_threshold: input.softWarnThreshold,
    })
    .eq("id", input.walletId);
  if (error) throw error;
}

/** Super-admin-only field (locked, enforced by the DB trigger regardless of this check). */
export async function setSelfManageEnabled(
  supabase: SupabaseClient,
  input: { walletId: string; selfManageEnabled: boolean },
): Promise<void> {
  const { error } = await supabase
    .from("ai_credit_wallets")
    .update({ self_manage_enabled: input.selfManageEnabled })
    .eq("id", input.walletId);
  if (error) throw error;
}

export async function allocateWalletCredits(
  supabase: SupabaseClient,
  input: { walletId: string; credits: number; note?: string | null },
): Promise<void> {
  const { error } = await supabase.rpc("allocate_wallet_credits", {
    p_wallet_id: input.walletId,
    p_credits: input.credits,
    p_note: input.note ?? null,
  });
  if (error) throw error;
}

/**
 * The institution's default grant/enforcement applied to a newly created
 * class's auto-provisioned wallet (seed_class_ai_credit_wallet trigger,
 * 20260717000000_ai_credit_wallets_auto_provision.sql). `null` = unbounded —
 * new classes get an explicit `enforcement='off'` wallet instead. Lives on
 * `ai_institution_settings` (not `ai_credit_wallets`) since institution
 * admins already have write access to that row without any new RLS.
 */
export async function getDefaultClassWalletCredits(
  supabase: SupabaseClient,
  institutionId: string,
): Promise<number | null> {
  const { data, error } = await supabase
    .from("ai_institution_settings")
    .select("default_class_wallet_credits")
    .eq("institution_id", institutionId)
    .maybeSingle();
  if (error) throw error;
  return (data?.default_class_wallet_credits as number | null | undefined) ?? null;
}

export async function setDefaultClassWalletCredits(
  supabase: SupabaseClient,
  input: { institutionId: string; credits: number | null },
): Promise<void> {
  const { error } = await supabase.from("ai_institution_settings").upsert(
    { institution_id: input.institutionId, default_class_wallet_credits: input.credits },
    { onConflict: "institution_id" },
  );
  if (error) throw error;
}
