"use client";

import AiAccessAndLimitCard, {
  type AiSpendMode,
  type ByokCounting,
} from "@/components/Settings/AiConfig/AiAccessAndLimitCard";
import { spendModeForWallet } from "@/lib/ai/metering/spendMode";
import type {
  AiCreditWallet,
  DefaultClassWalletSettings,
} from "@/lib/queries/aiCreditWallets";

import DefaultClassWalletCreditsForm from "./DefaultClassWalletCreditsForm";

interface ClassOption {
  id: string;
  name: string;
}

interface WalletsPanelProps {
  scope: "institution" | "class";
  /** Institution scope only. */
  institutionId?: string;
  defaultClassWalletSettings?: DefaultClassWalletSettings | null;
  /** Institution scope only — the institution's credit pool wallet (`class_id === null`). */
  institutionWallets: AiCreditWallet[];
  /** Institution scope: every class's cap wallets in this institution. Class scope: just this class's. */
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
  onByokCountingChange?: (
    wallet: AiCreditWallet,
    classId: string,
    next: ByokCounting,
  ) => void;
}

export default function WalletsPanel({
  scope,
  institutionId,
  defaultClassWalletSettings,
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
  onByokCountingChange,
}: WalletsPanelProps) {
  const renderClassWalletCard = (classId: string) => {
    const platformWallet = classWallets.find((w) => w.class_id === classId);

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
        byokCounting={
          platformWallet
            ? {
                countInstitutionByok: platformWallet.count_institution_byok,
                countClassByok: platformWallet.count_class_byok,
              }
            : undefined
        }
        onByokCountingChange={
          platformWallet && onByokCountingChange
            ? (next) => onByokCountingChange(platformWallet, classId, next)
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

  const institutionPlatformWallet = institutionWallets[0];

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
            defaultSettings={
              defaultClassWalletSettings ?? {
                credits: null,
                countInstitutionByok: true,
                countClassByok: false,
              }
            }
          />
        )}
      </section>
    </div>
  );
}
