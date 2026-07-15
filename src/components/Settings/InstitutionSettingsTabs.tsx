"use client";

import { useMemo, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import {
  MutedPrimaryTabsList,
  MutedPrimaryTabsTrigger,
} from "@/components/Teacher/Shared/MutedPrimaryTabs";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { useTrackedRouter } from "@/hooks/useTrackedRouter";
import type { ViewerRole } from "@/lib/settings/capabilities";
import type { EffectiveSettings } from "@/lib/settings/resolve";
import type { AiInstitutionPolicy } from "@/types/aiSettings";

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

interface InstitutionSettingsTabsProps {
  institutionId: string;
  institution: Institution;
  viewerRole: ViewerRole;
  effectiveSettings: EffectiveSettings;
  institutionPolicy: AiInstitutionPolicy;
  adminsSection?: ReactNode;
  /** "Manage Activity Templates" link target for this institution's template library. */
  activityTemplatesManageHref: string;
  /** "AI credit wallets" link target for this institution's wallet funding/policy page. */
  walletsManageHref: string;
  /** Super-admin-only Danger Zone (delete/archive/restore institution). */
  dangerZoneSection?: ReactNode;
}

export default function InstitutionSettingsTabs({
  institutionId,
  institution,
  viewerRole,
  effectiveSettings,
  institutionPolicy,
  adminsSection,
  activityTemplatesManageHref,
  walletsManageHref,
  dangerZoneSection,
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
        <div className="rounded-lg border p-4">
          <p className="text-sm font-medium">AI credit wallets</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Fund and configure AI usage enforcement for this institution and
            its classes.
          </p>
          <Link
            href={walletsManageHref}
            className="mt-2 inline-block text-sm underline underline-offset-2"
          >
            Manage wallets
          </Link>
        </div>
        {adminsSection}
        {dangerZoneSection}
      </TabsContent>

      <TabsContent value="ai" className="mt-0">
        <InstitutionAiManagementTab
          institutionId={institutionId}
          viewerRole={viewerRole}
          institutionPolicy={institutionPolicy}
        />
      </TabsContent>
    </Tabs>
  );
}
