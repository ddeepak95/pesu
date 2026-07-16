"use client";

import { useMemo, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";

import {
  MutedPrimaryTabsList,
  MutedPrimaryTabsTrigger,
} from "@/components/Teacher/Shared/MutedPrimaryTabs";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { useTrackedRouter } from "@/hooks/useTrackedRouter";
import type { AiCreditWallet } from "@/lib/queries/aiCreditWallets";
import type { ViewerRole } from "@/lib/settings/capabilities";
import type { EffectiveSettings } from "@/lib/settings/resolve";
import type { AiInstitutionPolicy } from "@/types/aiSettings";
import type { AiSpendMode } from "@/components/Settings/AiConfig/AiAccessAndLimitCard";

import InstitutionAiManagementTab from "./InstitutionAiManagementTab";
import InstitutionSettingsForm from "./InstitutionSettingsForm";
import InstitutionActivityTemplatesSection from "./InstitutionActivityTemplatesSection";
import InstitutionPreferredLanguageCard from "@/components/Platform/InstitutionPreferredLanguageCard";
import type { Institution } from "@/lib/queries/institutions";

const SETTINGS_TAB_PARAM = "settingsTab";

type SettingsSubTab = "general" | "ai";

function parseSettingsSubTab(raw: string | null): SettingsSubTab {
  return raw === "ai" ? "ai" : "general";
}

interface ClassOption {
  id: string;
  name: string;
  shortId?: string | null;
}

interface InstitutionSettingsTabsProps {
  institutionId: string;
  institution: Institution;
  viewerRole: ViewerRole;
  effectiveSettings: EffectiveSettings;
  institutionPolicy: AiInstitutionPolicy;
  adminsSection?: ReactNode;
  /** "Manage Activity Templates" link target for this institution's template library. */
  activityTemplatesManageHref: string;
  /** Super-admin-only Danger Zone (delete/archive/restore institution). */
  dangerZoneSection?: ReactNode;
  /** AI management tab data — wallets, access. */
  aiWallets: AiCreditWallet[];
  aiClasses: ClassOption[];
  aiClassAccessEnabled: Record<string, boolean>;
  aiDefaultClassWalletCredits: number | null;
  /** Feeds the "AI Credit Availability" card at the top of the AI management tab. */
  aiPlatformWalletBalance: number;
  aiPlatformWalletSpendMode: AiSpendMode;
}

export default function InstitutionSettingsTabs({
  institutionId,
  institution,
  viewerRole,
  effectiveSettings,
  institutionPolicy,
  adminsSection,
  activityTemplatesManageHref,
  dangerZoneSection,
  aiWallets,
  aiClasses,
  aiClassAccessEnabled,
  aiDefaultClassWalletCredits,
  aiPlatformWalletBalance,
  aiPlatformWalletSpendMode,
}: InstitutionSettingsTabsProps) {
  const router = useTrackedRouter();
  const searchParams = useSearchParams();

  const activeSettingsTab = useMemo(
    () => parseSettingsSubTab(searchParams.get(SETTINGS_TAB_PARAM)),
    [searchParams],
  );

  const handleSettingsTabChange = (value: string) => {
    const next = new URLSearchParams(searchParams.toString());
    next.set("tab", "settings");
    next.set(SETTINGS_TAB_PARAM, parseSettingsSubTab(value));
    router.replace(`?${next.toString()}`);
  };

  return (
    <Tabs
      value={activeSettingsTab}
      onValueChange={handleSettingsTabChange}
      className="w-full"
    >
      <MutedPrimaryTabsList className="mb-4 h-auto w-auto gap-1 rounded-md p-1">
        <MutedPrimaryTabsTrigger value="general" className="px-4 py-2">
          General
        </MutedPrimaryTabsTrigger>
        <MutedPrimaryTabsTrigger value="ai" className="px-4 py-2">
          AI management
        </MutedPrimaryTabsTrigger>
      </MutedPrimaryTabsList>

      <TabsContent value="general" className="mt-0 space-y-6">
        <InstitutionPreferredLanguageCard
          institution={institution}
          isSuper={viewerRole === "super_admin"}
        />
        <InstitutionSettingsForm
          institutionId={institutionId}
          viewerRole={viewerRole}
          initialEffective={effectiveSettings}
        />
        <InstitutionActivityTemplatesSection
          institutionId={institutionId}
          manageHref={activityTemplatesManageHref}
        />
        {adminsSection}
        {dangerZoneSection}
      </TabsContent>

      <TabsContent value="ai" className="mt-0">
        <InstitutionAiManagementTab
          institutionId={institutionId}
          viewerRole={viewerRole}
          institutionPolicy={institutionPolicy}
          wallets={aiWallets}
          classes={aiClasses}
          classAccessEnabled={aiClassAccessEnabled}
          defaultClassWalletCredits={aiDefaultClassWalletCredits}
          platformWalletBalance={aiPlatformWalletBalance}
          platformWalletSpendMode={aiPlatformWalletSpendMode}
        />
      </TabsContent>
    </Tabs>
  );
}
