import { notFound } from "next/navigation";

import PageLayout from "@/components/PageLayout";
import InstitutionDetailView from "@/components/Platform/InstitutionDetailView";
import { requireSuperAdmin } from "@/lib/dal";
import {
  getInstitution,
  getUserEmailsByIds,
  listClassesInInstitution,
  listClassMoves,
  listInstitutionMembers,
  listInstitutions,
} from "@/lib/queries/institutions";
import { getInstitutionAiPolicy } from "@/lib/queries/aiInstitutionSettings";
import { getEffectiveSettingsForInstitution } from "@/lib/queries/settings";
import { getClassAiAccessEnabledMap } from "@/lib/queries/aiClassSettings";
import {
  getDefaultClassWalletSettings,
  listWalletsForInstitution,
} from "@/lib/queries/aiCreditWallets";
import {
  getMonthlyUsageByModality,
  getWalletFundingHistory,
} from "@/lib/queries/aiUsage";
import { spendModeForWallet } from "@/lib/ai/metering/spendMode";

export const metadata = {
  title: "Institution",
};

export default async function InstitutionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { id } = await params;
  const { ok, error } = await searchParams;
  const { supabase } = await requireSuperAdmin();

  const institution = await getInstitution(supabase, id);
  if (!institution) notFound();

  const [
    members,
    classes,
    moves,
    allInstitutions,
    effectiveSettings,
    institutionPolicy,
    aiWallets,
    defaultClassWalletSettings,
    usageBreakdown,
  ] = await Promise.all([
    listInstitutionMembers(supabase, id),
    listClassesInInstitution(supabase, id),
    listClassMoves(supabase, { institutionId: id, limit: 25 }),
    listInstitutions(supabase),
    getEffectiveSettingsForInstitution(supabase, id),
    getInstitutionAiPolicy(supabase, id),
    listWalletsForInstitution(supabase, id),
    getDefaultClassWalletSettings(supabase, id),
    getMonthlyUsageByModality(supabase, { institutionId: id }),
  ]);

  const classAccessEnabled = await getClassAiAccessEnabledMap(
    supabase,
    classes.map((c) => c.id),
  );
  const platformWallet = aiWallets.find((w) => w.class_id === null);
  const fundingHistory = platformWallet
    ? await getWalletFundingHistory(supabase, platformWallet.id)
    : [];

  const memberIds = members.map((m) => m.user_id);
  const moverIds = moves.map((m) => m.moved_by);
  const allUserIds = Array.from(new Set([...memberIds, ...moverIds]));
  const userEmails = await getUserEmailsByIds(supabase, allUserIds);

  const userEmailEntries: Array<[string, string]> = Array.from(
    userEmails.entries(),
  );
  const institutionNameEntries: Array<[string, string]> = allInstitutions.map(
    (inst) => [inst.id, inst.name],
  );

  return (
    <PageLayout>
      <InstitutionDetailView
        institution={institution}
        members={members}
        classes={classes}
        moves={moves}
        userEmailEntries={userEmailEntries}
        institutionNameEntries={institutionNameEntries}
        viewerRole="super_admin"
        backHref="/platform"
        backLabel="Back to platform admin"
        effectiveSettings={effectiveSettings}
        institutionPolicy={institutionPolicy}
        classOverrideHrefBase={`/platform/institutions/${id}/classes`}
        notice={{ ok, error }}
        activityTemplatesManageHref={`/platform/institutions/${id}/activity-templates`}
        aiWallets={aiWallets}
        aiClassAccessEnabled={classAccessEnabled}
        aiDefaultClassWalletSettings={defaultClassWalletSettings}
        aiPlatformWalletBalance={platformWallet?.balance ?? 0}
        aiPlatformWalletSpendMode={spendModeForWallet(platformWallet)}
        aiUsageBreakdown={usageBreakdown}
        aiFundingHistory={fundingHistory}
      />
    </PageLayout>
  );
}
