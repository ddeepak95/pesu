import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getClassAiAccessEnabled } from "@/lib/queries/aiClassSettings";
import { listWalletsForClass, type AiCreditWallet } from "@/lib/queries/aiCreditWallets";
import { getMonthlyUsageByModality, getWalletFundingHistory } from "@/lib/queries/aiUsage";
import type { UsageBreakdownRow } from "@/components/Platform/Usage/UsageBreakdownTable";
import type { WalletFundingEntry } from "@/lib/queries/aiUsage";

export interface ClassAiManagementData {
  wallets: AiCreditWallet[];
  classAccessEnabled: boolean;
  platformWalletBalance: number;
  usageBreakdown: UsageBreakdownRow[];
  fundingHistory: WalletFundingEntry[];
}

/**
 * Bundles the four reads the class settings "AI management" tab needs
 * (wallets, access flag, this month's usage, funding history) — used by all
 * three class-settings route trees (teacher / admin / platform) so the
 * fetch shape stays identical across them.
 */
export async function getClassAiManagementData(
  supabase: SupabaseClient,
  input: { classId: string; institutionId: string },
): Promise<ClassAiManagementData> {
  const [wallets, classAccessEnabled, usageBreakdown] = await Promise.all([
    listWalletsForClass(supabase, input.classId),
    getClassAiAccessEnabled(supabase, input.classId),
    getMonthlyUsageByModality(supabase, {
      institutionId: input.institutionId,
      classId: input.classId,
    }),
  ]);

  const platformWallet = wallets.find((w) => w.key_owner === "platform");
  const fundingHistory = platformWallet
    ? await getWalletFundingHistory(supabase, platformWallet.id)
    : [];

  return {
    wallets,
    classAccessEnabled,
    platformWalletBalance: platformWallet?.balance ?? 0,
    usageBreakdown,
    fundingHistory,
  };
}
