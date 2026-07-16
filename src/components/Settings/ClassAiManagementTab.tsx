"use client";

import {
  canViewClassOverrideSections,
  type ViewerRole,
} from "@/lib/settings/capabilities";
import type { AiCreditWallet } from "@/lib/queries/aiCreditWallets";
import {
  resolveClassOverridePolicy,
  type AiClassOverridePolicy,
  type AiInstitutionPolicy,
} from "@/types/aiSettings";
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
  // The wallet/credit-limit editing panel (WalletsPanelContainer) is an
  // admin-only surface — it always renders fully editable
  // (WalletsPanelContainer.canEditClassWallet is unconditionally true,
  // relying on the caller to only mount it for admins). Class teachers
  // (owner/co-owner/admin) only ever get the read-only availability card
  // below.
  const isInstitutionOrSuperAdmin =
    viewerRole === "institution_admin" || viewerRole === "super_admin";
  const resolvedOverride = resolveClassOverridePolicy(
    institutionPolicy,
    classOverridePolicy,
  );
  const canViewConfiguration =
    canViewClassOverrideSections(
      viewerRole,
      resolvedOverride.allowChildOverrideProviders,
    ) ||
    canViewClassOverrideSections(
      viewerRole,
      resolvedOverride.allowChildOverrideFunctions,
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
          {isInstitutionOrSuperAdmin && (
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
          )}
          {!classAccessEnabled && canViewConfiguration && (
            <p className="text-sm text-muted-foreground">
              This class isn&apos;t using the institution&apos;s AI setup —{" "}
              <a href="#class-ai-provider-config" className="underline">
                configure the class&apos;s own AI provider keys
              </a>{" "}
              below.
            </p>
          )}
          {canViewConfiguration && (
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
          )}
        </div>
      }
    />
  );
}
