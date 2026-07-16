"use client";

import {
  canViewClassOverrideSections,
  type ViewerRole,
} from "@/lib/settings/capabilities";
import type { UsageBreakdownRow } from "@/components/Platform/Usage/UsageBreakdownTable";
import type { WalletFundingEntry } from "@/lib/queries/aiUsage";
import type { AiCreditWallet } from "@/lib/queries/aiCreditWallets";
import type { AiClassOverridePolicy, AiInstitutionPolicy } from "@/types/aiSettings";

import AiManagementPanels from "./AiConfig/AiManagementPanels";
import AiSettingsPageContent from "./AiConfig/AiSettingsPageContent";
import UsageOverview from "@/components/Platform/Usage/UsageOverview";
import WalletsPanelContainer from "./AiConfig/Wallet/WalletsPanelContainer";

interface ClassAiManagementTabProps {
  classDbId: string;
  className: string;
  classShortId?: string | null;
  institutionId: string;
  viewerRole: ViewerRole;
  institutionPolicy: AiInstitutionPolicy;
  classOverridePolicy: AiClassOverridePolicy;
  wallets: AiCreditWallet[];
  classAccessEnabled: boolean;
  platformWalletBalance: number;
  usageBreakdown: UsageBreakdownRow[];
  fundingHistory: WalletFundingEntry[];
}

/**
 * The class's "AI management" tab content — visibility of the *tab itself*
 * (decision 4: override rights OR the class has its own wallet) is decided
 * one level up, in ClassSettingsClient; this component only gates its
 * Configuration sub-tab on override rights, since Wallets & limits/Usage are
 * relevant whenever the tab is shown at all.
 */
export default function ClassAiManagementTab({
  classDbId,
  className,
  classShortId,
  institutionId,
  viewerRole,
  institutionPolicy,
  classOverridePolicy,
  wallets,
  classAccessEnabled,
  platformWalletBalance,
  usageBreakdown,
  fundingHistory,
}: ClassAiManagementTabProps) {
  const isSuperAdmin = viewerRole === "super_admin";
  const canViewConfiguration = canViewClassOverrideSections(
    viewerRole,
    classOverridePolicy.allowChildOverride,
  );

  return (
    <AiManagementPanels
      configuration={
        <div className="space-y-6">
          <WalletsPanelContainer
            scope="class"
            institutionId={institutionId}
            isSuperAdmin={isSuperAdmin}
            institutionWallets={[]}
            classWallets={wallets}
            classes={[{ id: classDbId, name: className, shortId: classShortId }]}
            accessEnabled={classAccessEnabled}
            classAccessEnabled={{ [classDbId]: classAccessEnabled }}
          />
          {!classAccessEnabled && canViewConfiguration && (
            <p className="text-sm text-muted-foreground">
              This class isn&apos;t using the institution&apos;s AI setup —{" "}
              <a href="#class-ai-provider-config" className="underline">
                configure the class&apos;s own AI provider keys
              </a>{" "}
              below.
            </p>
          )}
          {canViewConfiguration ? (
            <div id="class-ai-provider-config">
              <AiSettingsPageContent
                scope="class"
                scopeId={classDbId}
                classShortId={classShortId}
                institutionId={institutionId}
                title="Class AI configuration"
                description="Override institution model assignments for this class, or inherit institution defaults per provider and app function."
                viewerRole={viewerRole}
                institutionPolicy={institutionPolicy}
                classOverridePolicy={classOverridePolicy}
                classAccessEnabled={classAccessEnabled}
              />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              AI configuration overrides are not available for your role or
              institution policy.
            </p>
          )}
        </div>
      }
      usage={
        <UsageOverview
          balance={platformWalletBalance}
          breakdown={usageBreakdown}
          fundingHistory={fundingHistory}
        />
      }
    />
  );
}
