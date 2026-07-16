"use client";

import {
  canViewClassOverrideSections,
  type ViewerRole,
} from "@/lib/settings/capabilities";
import type { AiCreditWallet } from "@/lib/queries/aiCreditWallets";
import type { AiClassOverridePolicy, AiInstitutionPolicy } from "@/types/aiSettings";
import type { AiSpendMode } from "@/components/Settings/AiConfig/AiAccessAndLimitCard";

import AiManagementPanels from "./AiConfig/AiManagementPanels";
import AiSettingsPageContent from "./AiConfig/AiSettingsPageContent";
import WalletsPanelContainer from "./AiConfig/Wallet/WalletsPanelContainer";
import CreditAvailabilityCard from "@/components/Platform/Usage/CreditAvailabilityCard";

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
  platformWalletSpendMode: AiSpendMode;
}

/**
 * The class's "AI management" tab content — visibility of the *tab itself*
 * (decision 4: override rights OR the class has its own wallet) is decided
 * one level up, in ClassSettingsClient; this component only gates its
 * Configuration content on override rights. Usage now lives in the
 * sibling top-level "Analytics and Logs" tab.
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
  platformWalletSpendMode,
}: ClassAiManagementTabProps) {
  const isSuperAdmin = viewerRole === "super_admin";
  const canViewConfiguration =
    canViewClassOverrideSections(
      viewerRole,
      classOverridePolicy.allowChildOverrideProviders,
    ) ||
    canViewClassOverrideSections(
      viewerRole,
      classOverridePolicy.allowChildOverrideFunctions,
    );

  return (
    <AiManagementPanels
      configuration={
        <div className="space-y-6">
          <CreditAvailabilityCard
            scope="class"
            accessEnabled={classAccessEnabled}
            spendMode={platformWalletSpendMode}
            balance={platformWalletBalance}
          />
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
    />
  );
}
