"use client";

import { useState, useTransition } from "react";

import { useTrackedRouter } from "@/hooks/useTrackedRouter";
import { setInstitutionAiConfigLocksAction } from "@/lib/ai/credentials/actions";
import {
  allocateCreditsResultAction,
  createWalletResultAction,
  setClassAiAccessEnabledAction,
  updateWalletPolicyResultAction,
} from "@/lib/ai/metering/actions";
import { enforcementForSpendMode } from "@/lib/ai/metering/spendMode";
import type { AiSpendMode } from "@/components/Settings/AiConfig/AiAccessAndLimitCard";
import type { AiCreditWallet } from "@/lib/queries/aiCreditWallets";

import WalletsPanel from "./WalletsPanel";

interface ClassOption {
  id: string;
  name: string;
  shortId?: string | null;
}

interface WalletsPanelContainerProps {
  scope: "institution" | "class";
  institutionId: string;
  isSuperAdmin: boolean;
  /** Institution scope only. */
  defaultClassWalletCredits?: number | null;
  /** Institution scope only — this scope's own wallets (`class_id === null`). */
  institutionWallets: AiCreditWallet[];
  /** Institution scope: every class's wallets. Class scope: just this class's. */
  classWallets: AiCreditWallet[];
  /** Institution scope: every class in the institution. Class scope: the single active class. */
  classes: ClassOption[];
  /** `allow_use_platform_defaults`. */
  accessEnabled: boolean;
  /** `ai_class_settings.ai_access_enabled` per class id. */
  classAccessEnabled: Record<string, boolean>;
}

/**
 * Wires WalletsPanel's presentational callbacks to the real server actions
 * (src/lib/ai/metering/actions.ts) and the existing
 * setInstitutionAiConfigLocksAction. Holds an optimistic local copy of the
 * wallet/access state, resynced from props whenever the server parent
 * re-renders with fresh data (router.refresh() after a successful action).
 * BYOK usage is unmetered and has no wallets to manage here. No wallet needs
 * to exist ahead of time: switching Credit Limits to "Limited" with no wallet
 * yet creates one transparently (no wallet = unrestricted, same as
 * Unbounded).
 */
export default function WalletsPanelContainer({
  scope,
  institutionId,
  isSuperAdmin,
  defaultClassWalletCredits,
  institutionWallets: initialInstitutionWallets,
  classWallets: initialClassWallets,
  classes,
  accessEnabled: initialAccessEnabled,
  classAccessEnabled: initialClassAccessEnabled,
}: WalletsPanelContainerProps) {
  const router = useTrackedRouter();
  const [, startTransition] = useTransition();

  const [wallets, setWallets] = useState<AiCreditWallet[]>([
    ...initialInstitutionWallets,
    ...initialClassWallets,
  ]);
  const [accessEnabled, setAccessEnabled] = useState(initialAccessEnabled);
  const [classAccessEnabled, setClassAccessEnabled] = useState(
    initialClassAccessEnabled,
  );
  const [error, setError] = useState<string | null>(null);

  // Resync local (optimistic) state when the server parent re-renders with
  // fresh data (router.refresh() after a successful action) — adjusted
  // during render, not in an effect, per
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes.
  const [prevProps, setPrevProps] = useState({
    initialInstitutionWallets,
    initialClassWallets,
    initialAccessEnabled,
    initialClassAccessEnabled,
  });
  if (
    prevProps.initialInstitutionWallets !== initialInstitutionWallets ||
    prevProps.initialClassWallets !== initialClassWallets ||
    prevProps.initialAccessEnabled !== initialAccessEnabled ||
    prevProps.initialClassAccessEnabled !== initialClassAccessEnabled
  ) {
    setPrevProps({
      initialInstitutionWallets,
      initialClassWallets,
      initialAccessEnabled,
      initialClassAccessEnabled,
    });
    setWallets([...initialInstitutionWallets, ...initialClassWallets]);
    setAccessEnabled(initialAccessEnabled);
    setClassAccessEnabled(initialClassAccessEnabled);
  }

  const patchWallet = (walletId: string, patch: Partial<AiCreditWallet>) => {
    setWallets((prev) =>
      prev.map((w) => (w.id === walletId ? { ...w, ...patch } : w)),
    );
  };

  const classById = new Map(classes.map((c) => [c.id, c]));

  const handleAccessEnabledChange = (enabled: boolean) => {
    setError(null);
    const previous = accessEnabled;
    setAccessEnabled(enabled);
    startTransition(async () => {
      const result = await setInstitutionAiConfigLocksAction({
        institutionId,
        lock: "allow_use_platform_defaults",
        enabled,
      });
      if (!result.ok) {
        setAccessEnabled(previous);
        setError(result.error ?? "Failed to update platform AI access");
        return;
      }
      router.refresh();
    });
  };

  const handleClassAccessEnabledChange = (classId: string, enabled: boolean) => {
    setError(null);
    const previous = classAccessEnabled[classId] ?? true;
    setClassAccessEnabled((prev) => ({ ...prev, [classId]: enabled }));
    startTransition(async () => {
      const result = await setClassAiAccessEnabledAction({
        classDbId: classId,
        classShortId: classById.get(classId)?.shortId,
        enabled,
      });
      if (!result.ok) {
        setClassAccessEnabled((prev) => ({ ...prev, [classId]: previous }));
        setError(result.error ?? "Failed to update class AI access");
        return;
      }
      router.refresh();
    });
  };

  const handleSpendModeChange = (
    wallet: AiCreditWallet | undefined,
    classId: string | null,
    mode: AiSpendMode,
  ) => {
    setError(null);
    const enforcement = enforcementForSpendMode(mode);

    if (!wallet) {
      if (mode === "unbounded") return; // no wallet + unbounded is already the default state
      startTransition(async () => {
        const result = await createWalletResultAction({
          institutionId,
          classId,
          enforcement,
          classShortId: classId ? classById.get(classId)?.shortId : undefined,
        });
        if (!result.ok || !result.wallet) {
          setError(result.error ?? "Failed to update credit limits");
          return;
        }
        setWallets((prev) => [...prev, result.wallet!]);
        router.refresh();
      });
      return;
    }

    const previous = wallet.enforcement;
    patchWallet(wallet.id, { enforcement });
    startTransition(async () => {
      const result = await updateWalletPolicyResultAction({
        institutionId,
        walletId: wallet.id,
        enforcement,
        maxBalance: wallet.max_balance,
        softWarnThreshold: wallet.soft_warn_threshold,
        classId,
        classShortId: classId ? classById.get(classId)?.shortId : undefined,
      });
      if (!result.ok) {
        patchWallet(wallet.id, { enforcement: previous });
        setError(result.error ?? "Failed to update spending");
        return;
      }
      router.refresh();
    });
  };

  const handleAdjustCredits = (walletId: string, delta: number) => {
    const wallet = wallets.find((w) => w.id === walletId);
    if (!wallet) return;
    setError(null);
    patchWallet(walletId, { balance: wallet.balance + delta });
    startTransition(async () => {
      const result = await allocateCreditsResultAction({
        institutionId,
        walletId,
        credits: delta,
        note: null,
        classId: wallet.class_id,
        classShortId: wallet.class_id ? classById.get(wallet.class_id)?.shortId : undefined,
      });
      if (!result.ok) {
        patchWallet(walletId, { balance: wallet.balance });
        setError(result.error ?? "Failed to update credits");
        return;
      }
      router.refresh();
    });
  };

  const canEditInstitutionWallet = () => isSuperAdmin;
  const canEditClassWallet = () => true; // RLS: institution admins can edit any class wallet in their institution

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-destructive">{error}</p>}
      <WalletsPanel
        scope={scope}
        institutionId={scope === "institution" ? institutionId : undefined}
        defaultClassWalletCredits={defaultClassWalletCredits}
        institutionWallets={wallets.filter((w) => w.class_id === null)}
        classWallets={wallets.filter((w) => w.class_id !== null)}
        classes={classes}
        accessEnabled={accessEnabled}
        onAccessEnabledChange={handleAccessEnabledChange}
        classAccessEnabled={classAccessEnabled}
        onClassAccessEnabledChange={handleClassAccessEnabledChange}
        canEditInstitutionWallet={canEditInstitutionWallet}
        canEditClassWallet={canEditClassWallet}
        onSpendModeChange={handleSpendModeChange}
        onAdjustCredits={handleAdjustCredits}
      />
    </div>
  );
}
