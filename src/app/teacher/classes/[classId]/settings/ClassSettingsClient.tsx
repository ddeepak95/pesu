"use client";

import { useCallback, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTrackedRouter } from "@/hooks/useTrackedRouter";
import PageLayout from "@/components/PageLayout";
import BackButton from "@/components/ui/back-button";
import {
  MutedPrimaryTabsList,
  MutedPrimaryTabsTrigger,
} from "@/components/Teacher/Shared/MutedPrimaryTabs";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import GeneralSettingsSection from "@/components/Teacher/Classes/Settings/GeneralSettingsSection";
import ManageTeachersSection from "@/components/Teacher/Classes/Settings/ManageTeachersSection";
import ManageStudentsSection from "@/components/Teacher/Classes/Settings/ManageStudentsSection";
import GroupSettingsSection from "@/components/Teacher/Classes/Settings/GroupSettingsSection";
import ActivityTypesSection from "@/components/Teacher/Classes/Settings/ActivityTypesSection";
import ProfileFieldsSection from "@/components/Teacher/Classes/Settings/ProfileFieldsSection";
import ProgressiveUnlockSection from "@/components/Teacher/Classes/Settings/ProgressiveUnlockSection";
import ResetProgressSection from "@/components/Teacher/Classes/Settings/ResetProgressSection";
import DuplicateClassSection from "@/components/Teacher/Classes/Settings/DuplicateClassSection";
import ArchiveClassSection from "@/components/Teacher/Classes/Settings/ArchiveClassSection";
import { ArchivedClassBanner } from "@/components/Shared/ArchivedClassBanner";
import DangerZoneSection from "@/components/Teacher/Classes/Settings/DangerZoneSection";
import AiConfigMisconfigBanner from "@/components/Settings/AiConfig/AiConfigMisconfigBanner";
import ClassAiManagementTab from "@/components/Settings/ClassAiManagementTab";
import ClassInheritedSettingsSection from "@/components/Settings/ClassInheritedSettingsSection";
import { canViewClassOverrideSections } from "@/lib/settings/capabilities";
import UsageOverview from "@/components/Platform/Usage/UsageOverview";
import type { AiSpendMode } from "@/components/Settings/AiConfig/AiAccessAndLimitCard";
import type { UsageBreakdownRow, WalletFundingEntry } from "@/lib/queries/aiUsage";
import type { AiCreditWallet } from "@/lib/queries/aiCreditWallets";
import type { AiClassOverridePolicy, AiInstitutionPolicy } from "@/types/aiSettings";
import type { ViewerRole } from "@/lib/settings/capabilities";
import { Class } from "@/types/class";

const SETTINGS_TAB_PARAM = "settingsTab";

type SettingsSubTab = "general" | "ai" | "analytics";

function parseSettingsSubTab(raw: string | null): SettingsSubTab {
  if (raw === "ai") return "ai";
  if (raw === "analytics") return "analytics";
  return "general";
}

interface ClassSettingsClientProps {
  classData: Class;
  classId: string;
  userId: string;
  viewerRole: ViewerRole;
  institutionPolicy?: AiInstitutionPolicy;
  classOverridePolicy?: AiClassOverridePolicy;
  /**
   * Optional explicit back-link target. When provided, replaces the default
   * history-based `<BackButton />`. Used by the institution/super-admin
   * drill-down routes so the back arrow returns to the institution detail
   * page on the correct tab.
   */
  backHref?: string;
  backLabel?: string;
  /**
   * Route prefix for "Manage Activity Templates" and its create/edit
   * subpages. Defaults to the teacher route; the institution/super-admin
   * drill-down routes pass their own so the link doesn't 404 for a viewer
   * who isn't a class_teachers member.
   */
  activityTemplatesBasePath?: string;
  /** This class's own wallets (0-2 rows) — drives both the AI tab's content and its visibility (decision 4). */
  aiWallets?: AiCreditWallet[];
  aiClassAccessEnabled?: boolean;
  aiPlatformWalletBalance?: number;
  aiPlatformWalletSpendMode?: AiSpendMode;
  aiUsageBreakdown?: UsageBreakdownRow[];
  aiFundingHistory?: WalletFundingEntry[];
}

export default function ClassSettingsClient({
  classData: initialClassData,
  classId,
  userId,
  viewerRole,
  backHref,
  backLabel,
  institutionPolicy,
  classOverridePolicy,
  activityTemplatesBasePath,
  aiWallets = [],
  aiClassAccessEnabled = true,
  aiPlatformWalletBalance = 0,
  aiPlatformWalletSpendMode = "unbounded",
  aiUsageBreakdown = [],
  aiFundingHistory = [],
}: ClassSettingsClientProps) {
  const router = useTrackedRouter();
  const searchParams = useSearchParams();

  const handleUpdated = useCallback(() => {
    router.refresh();
  }, [router]);

  const canConfigureSettings =
    viewerRole === "class_owner" ||
    viewerRole === "class_teacher_co_owner" ||
    viewerRole === "class_teacher_admin" ||
    viewerRole === "institution_admin" ||
    viewerRole === "super_admin";

  const hasFullClassControlView =
    viewerRole === "class_owner" ||
    viewerRole === "class_teacher_co_owner" ||
    viewerRole === "institution_admin" ||
    viewerRole === "super_admin";

  const canPromoteCoOwner = hasFullClassControlView;

  const canTransferPrimaryOwnership =
    viewerRole === "institution_admin" || viewerRole === "super_admin";

  /** Legacy prop name on settings sections: permitted to change settings here. */
  const sectionMayEdit = canConfigureSettings;

  // Decision 4 (dev-docs/ai-usage-metering-phase4-plan.md): the AI
  // management tab shows iff the viewer can manage AI overrides, or the
  // class already has its own wallet to see even without override rights.
  const showAiTab =
    !!initialClassData.institution_id &&
    !!institutionPolicy &&
    !!classOverridePolicy &&
    (canViewClassOverrideSections(
      viewerRole,
      classOverridePolicy.allowChildOverride,
    ) ||
      aiWallets.length > 0);

  const activeSettingsTab = useMemo(() => {
    const parsed = parseSettingsSubTab(searchParams.get(SETTINGS_TAB_PARAM));
    return (parsed === "ai" || parsed === "analytics") && !showAiTab
      ? "general"
      : parsed;
  }, [searchParams, showAiTab]);

  const handleSettingsTabChange = (value: string) => {
    const next = new URLSearchParams(searchParams.toString());
    next.set(SETTINGS_TAB_PARAM, parseSettingsSubTab(value));
    router.replace(`?${next.toString()}`);
  };

  return (
    <PageLayout>
      <div>
        <div className="mb-4">
          {backHref && backLabel ? (
            <Link
              href={backHref}
              className="text-muted-foreground hover:text-foreground text-sm"
            >
              &larr; {backLabel}
            </Link>
          ) : (
            <BackButton />
          )}
        </div>
        <h1 className="text-3xl font-bold mb-2">{initialClassData.name}</h1>
        <p className="text-muted-foreground mb-8">
          Manage settings for this class.
        </p>

        {initialClassData.status === "archived" && (
          <div className="mb-6">
            <ArchivedClassBanner />
          </div>
        )}

        {initialClassData.institution_id && (
          <div className="mb-6">
            <AiConfigMisconfigBanner
              classDbId={initialClassData.id}
              institutionId={initialClassData.institution_id}
            />
          </div>
        )}

        <Tabs
          value={activeSettingsTab}
          onValueChange={handleSettingsTabChange}
          className="w-full"
        >
          <MutedPrimaryTabsList
            className="mb-4 h-auto w-auto gap-1 rounded-md p-1"
            hideWhenSingle
          >
            <MutedPrimaryTabsTrigger value="general" className="px-4 py-2">
              General
            </MutedPrimaryTabsTrigger>
            {showAiTab && (
              <MutedPrimaryTabsTrigger value="ai" className="px-4 py-2">
                AI management
              </MutedPrimaryTabsTrigger>
            )}
            {showAiTab && (
              <MutedPrimaryTabsTrigger value="analytics" className="px-4 py-2">
                Analytics and Logs
              </MutedPrimaryTabsTrigger>
            )}
          </MutedPrimaryTabsList>

          <TabsContent value="general" className="mt-0 space-y-6">
            {canConfigureSettings && (
              <>
                <GeneralSettingsSection
                  classData={initialClassData}
                  isOwner={sectionMayEdit}
                  onUpdated={handleUpdated}
                />

                <ManageTeachersSection
                  classData={initialClassData}
                  canManageRoster={sectionMayEdit}
                  canPromoteCoOwner={canPromoteCoOwner}
                  canTransferPrimaryOwnership={canTransferPrimaryOwnership}
                  onTeachersChanged={handleUpdated}
                />

                <ManageStudentsSection
                  classData={initialClassData}
                  canManageRoster={sectionMayEdit}
                />

                <GroupSettingsSection
                  classData={initialClassData}
                  isOwner={sectionMayEdit}
                  onUpdated={handleUpdated}
                />

                <ProfileFieldsSection
                  classData={initialClassData}
                  isOwner={sectionMayEdit}
                />

                <ActivityTypesSection
                  classData={initialClassData}
                  classShortId={classId}
                  userId={userId}
                  manageHref={activityTemplatesBasePath}
                />

                <ProgressiveUnlockSection
                  classData={initialClassData}
                  isOwner={sectionMayEdit}
                  onUpdated={handleUpdated}
                />
              </>
            )}

            <ClassInheritedSettingsSection
              classDbId={initialClassData.id}
              classShortId={classId}
              viewerRole={viewerRole}
            />

            {canConfigureSettings && (
              <>
                <ResetProgressSection
                  classId={initialClassData.id}
                  isOwner={sectionMayEdit}
                />

                <DuplicateClassSection
                  classData={initialClassData}
                  isOwner={sectionMayEdit}
                  onDuplicated={handleUpdated}
                />

                <ArchiveClassSection
                  classData={initialClassData}
                  canArchive={hasFullClassControlView}
                />

                <DangerZoneSection
                  classData={initialClassData}
                  canDeleteClass={hasFullClassControlView}
                />
              </>
            )}
          </TabsContent>

          {showAiTab && institutionPolicy && classOverridePolicy && (
            <TabsContent value="ai" className="mt-0">
              <ClassAiManagementTab
                classDbId={initialClassData.id}
                className={initialClassData.name}
                classShortId={classId}
                institutionId={initialClassData.institution_id as string}
                viewerRole={viewerRole}
                institutionPolicy={institutionPolicy}
                classOverridePolicy={classOverridePolicy}
                wallets={aiWallets}
                classAccessEnabled={aiClassAccessEnabled}
                platformWalletBalance={aiPlatformWalletBalance}
                platformWalletSpendMode={aiPlatformWalletSpendMode}
              />
            </TabsContent>
          )}

          {showAiTab && (
            <TabsContent value="analytics" className="mt-0">
              <UsageOverview
                institutionId={initialClassData.institution_id as string}
                classId={initialClassData.id}
                initialBreakdown={aiUsageBreakdown}
                fundingHistory={aiFundingHistory}
              />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </PageLayout>
  );
}
