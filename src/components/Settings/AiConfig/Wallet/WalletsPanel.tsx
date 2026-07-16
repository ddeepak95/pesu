"use client";

import AiAccessAndLimitCard, {
  type AiSpendMode,
} from "@/components/Settings/AiConfig/AiAccessAndLimitCard";
import { spendModeForWallet } from "@/lib/ai/metering/spendMode";
import type { AiCreditWallet } from "@/lib/queries/aiCreditWallets";

import DefaultClassWalletCreditsForm from "./DefaultClassWalletCreditsForm";

interface ClassOption {
  id: string;
  name: string;
}

interface WalletsPanelProps {
  scope: "institution" | "class";
  /** Institution scope only. */
  institutionId?: string;
  defaultClassWalletCredits?: number | null;
  /** Institution scope only — this scope's own wallets (`class_id === null`). Only the platform-key_owner row is shown. */
  institutionWallets: AiCreditWallet[];
  /** Institution scope: every class's wallets in this institution. Class scope: just this class's. Only the platform-key_owner row per class is shown. */
  classWallets: AiCreditWallet[];
  /** Institution scope: every class in the institution. Class scope: the single active class. */
  classes: ClassOption[];
  /** `allow_use_platform_defaults` — institution scope only. */
  accessEnabled: boolean;
  onAccessEnabledChange?: (enabled: boolean) => void;
  /** `ai_class_settings.ai_access_enabled` per class id — both scopes (institution browses many, class scope has just its own). */
  classAccessEnabled: Record<string, boolean>;
  onClassAccessEnabledChange?: (classId: string, enabled: boolean) => void;
  canEditInstitutionWallet: (wallet: AiCreditWallet | undefined) => boolean;
  canEditClassWallet: (wallet: AiCreditWallet | undefined) => boolean;
  onSpendModeChange: (
    wallet: AiCreditWallet | undefined,
    classId: string | null,
    mode: AiSpendMode,
  ) => void;
  onAdjustCredits: (walletId: string, delta: number) => void;
}

export default function WalletsPanel({
  scope,
  institutionId,
  defaultClassWalletCredits,
  institutionWallets,
  classWallets,
  classes,
  accessEnabled,
  onAccessEnabledChange,
  classAccessEnabled,
  onClassAccessEnabledChange,
  canEditInstitutionWallet,
  canEditClassWallet,
  onSpendModeChange,
  onAdjustCredits,
}: WalletsPanelProps) {
  const renderClassWalletCard = (classId: string) => {
    const platformWallet = classWallets.find(
      (w) => w.class_id === classId && w.key_owner === "platform",
    );

    return (
      <AiAccessAndLimitCard
        scope="class"
        accessEnabled={classAccessEnabled[classId] ?? true}
        onAccessEnabledChange={
          onClassAccessEnabledChange
            ? (enabled) => onClassAccessEnabledChange(classId, enabled)
            : undefined
        }
        spendMode={spendModeForWallet(platformWallet)}
        onSpendModeChange={(mode) =>
          onSpendModeChange(platformWallet, classId, mode)
        }
        balance={platformWallet?.balance ?? 0}
        onAdjustCredits={
          platformWallet
            ? (delta) => onAdjustCredits(platformWallet.id, delta)
            : undefined
        }
        readOnly={!canEditClassWallet(platformWallet)}
      />
    );
  };

  if (scope === "class") {
    const cls = classes[0];
    if (!cls) return null;
    return renderClassWalletCard(cls.id);
  }

  const institutionPlatformWallet = institutionWallets.find(
    (w) => w.key_owner === "platform",
  );

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <AiAccessAndLimitCard
          scope="institution"
          accessEnabled={accessEnabled}
          onAccessEnabledChange={onAccessEnabledChange}
          spendMode={spendModeForWallet(institutionPlatformWallet)}
          onSpendModeChange={(mode) =>
            onSpendModeChange(institutionPlatformWallet, null, mode)
          }
          balance={institutionPlatformWallet?.balance ?? 0}
          onAdjustCredits={
            institutionPlatformWallet
              ? (delta) => onAdjustCredits(institutionPlatformWallet.id, delta)
              : undefined
          }
          readOnly={!canEditInstitutionWallet(institutionPlatformWallet)}
        />
        {institutionId && (
          <DefaultClassWalletCreditsForm
            institutionId={institutionId}
            defaultCredits={defaultClassWalletCredits ?? null}
          />
        )}
      </section>
    </div>
  );
}
