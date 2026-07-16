"use client";

import {
  canViewInstitutionOverrideSections,
  type ViewerRole,
} from "@/lib/settings/capabilities";
import type { AiCreditWallet } from "@/lib/queries/aiCreditWallets";
import type { AiInstitutionPolicy } from "@/types/aiSettings";
import type { AiSpendMode } from "@/components/Settings/AiConfig/AiAccessAndLimitCard";

import AiManagementPanels from "./AiConfig/AiManagementPanels";
import AiSettingsPageContent from "./AiConfig/AiSettingsPageContent";
import WalletsPanelContainer from "./AiConfig/Wallet/WalletsPanelContainer";
import CreditAvailabilityCard from "@/components/Platform/Usage/CreditAvailabilityCard";

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
  platformWalletSpendMode: AiSpendMode;
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
  platformWalletSpendMode,
}: InstitutionAiManagementTabProps) {
  const isSuperAdmin = viewerRole === "super_admin";
  const canViewConfiguration =
    canViewInstitutionOverrideSections(
      viewerRole,
      institutionPolicy.allowAdminEditProviders,
    ) ||
    canViewInstitutionOverrideSections(
      viewerRole,
      institutionPolicy.allowAdminEditFunctions,
    );

  return (
    <AiManagementPanels
      configuration={
        <div className="space-y-6">
          <CreditAvailabilityCard
            scope="institution"
            accessEnabled={institutionPolicy.allowUsePlatformDefaults}
            spendMode={platformWalletSpendMode}
            balance={platformWalletBalance}
          />
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
    />
  );
}
