import type { AiSpendMode } from "@/components/Settings/AiConfig/AiAccessAndLimitCard";
import type { AiCreditWallet, WalletEnforcement } from "@/lib/queries/aiCreditWallets";

/**
 * D5 (dev-docs/ai-usage-metering-phase3-plan.md): no wallet row at all is
 * treated as unrestricted, same as `enforcement='off'`. A block-enforced
 * wallet at balance <= 0 still displays as "Limited" (not a separate
 * "Disabled" state) — the real kill switch is the access toggle
 * (AiAccessAndLimitCard's `accessEnabled`), enforced at the gateway, not a
 * wallet-balance hack.
 */
export function spendModeForWallet(
  wallet: Pick<AiCreditWallet, "enforcement" | "balance"> | undefined,
): AiSpendMode {
  if (!wallet) return "unbounded";
  if (wallet.enforcement === "off" || wallet.enforcement === "warn") {
    return "unbounded";
  }
  return "limited";
}

/**
 * The access card's two-way spend mode maps directly onto `enforcement`:
 * Unbounded -> 'off', Limited -> 'block'. 'warn' is not reachable from the
 * card — it stays available as a direct wallet edit for anyone who needs
 * the soft-warn-without-blocking behavior.
 */
export function enforcementForSpendMode(mode: AiSpendMode): WalletEnforcement {
  return mode === "unbounded" ? "off" : "block";
}
