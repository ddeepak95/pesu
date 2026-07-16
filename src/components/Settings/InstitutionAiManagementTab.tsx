"use client";

import {
  canViewInstitutionOverrideSections,
  type ViewerRole,
} from "@/lib/settings/capabilities";
import type { UsageBreakdownRow } from "@/components/Platform/Usage/UsageBreakdownTable";
import type { WalletFundingEntry } from "@/lib/queries/aiUsage";
import type { AiCreditWallet } from "@/lib/queries/aiCreditWallets";
import type { AiInstitutionPolicy } from "@/types/aiSettings";

import AiManagementPanels from "./AiConfig/AiManagementPanels";
import AiSettingsPageContent from "./AiConfig/AiSettingsPageContent";
import WalletsPanelContainer from "./AiConfig/Wallet/WalletsPanelContainer";
import UsageOverview from "@/components/Platform/Usage/UsageOverview";

interface ClassOption {
  id: string;
  name: string;
  shortId?: string | null;
}

interface InstitutionAiManagementTabProps {
  institutionId: string;
  viewerRole: ViewerRole;
  institutionPolicy: AiInstitutionPolicy;
  wallets: AiCreditWallet[];
  classes: ClassOption[];
  classAccessEnabled: Record<string, boolean>;
  defaultClassWalletCredits: number | null;
  platformWalletBalance: number;
  usageBreakdown: UsageBreakdownRow[];
  fundingHistory: WalletFundingEntry[];
}

export default function InstitutionAiManagementTab({
  institutionId,
  viewerRole,
  institutionPolicy,
  wallets,
  classes,
  classAccessEnabled,
  defaultClassWalletCredits,
  platformWalletBalance,
  usageBreakdown,
  fundingHistory,
}: InstitutionAiManagementTabProps) {
  const isSuperAdmin = viewerRole === "super_admin";
  const canViewConfiguration = canViewInstitutionOverrideSections(
    viewerRole,
    institutionPolicy.allowAdminEdit,
  );

  return (
    <AiManagementPanels
      configuration={
        <div className="space-y-6">
          <WalletsPanelContainer
            scope="institution"
            institutionId={institutionId}
            isSuperAdmin={isSuperAdmin}
            defaultClassWalletCredits={defaultClassWalletCredits}
            institutionWallets={wallets.filter((w) => w.class_id === null)}
            classWallets={wallets.filter((w) => w.class_id !== null)}
            classes={classes}
            accessEnabled={institutionPolicy.allowUsePlatformDefaults}
            classAccessEnabled={classAccessEnabled}
          />
          {canViewConfiguration ? (
            <AiSettingsPageContent
              scope="institution"
              scopeId={institutionId}
              title="AI configuration"
              description="Activate providers with institution keys or use platform keys per provider. App functions inherit platform model assignments unless you customize them."
              viewerRole={viewerRole}
              institutionPolicy={institutionPolicy}
              showLocks
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              AI configuration is not available for your role or institution
              policy.
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
