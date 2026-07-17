"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

import CreditAdjustControl from "./Wallet/CreditAdjustControl";

export type AiSpendMode = "unbounded" | "limited";

export interface ByokCounting {
  countInstitutionByok: boolean;
  countClassByok: boolean;
}

interface AiAccessAndLimitCardProps {
  scope: "institution" | "class";
  /**
   * The real kill switch, enforced at AI-call time by the gateway (not just
   * at provider-configuration time). Institution scope maps to
   * `ai_institution_settings.allow_use_platform_defaults`; class scope maps
   * to `ai_class_settings.ai_access_enabled`.
   */
  accessEnabled: boolean;
  onAccessEnabledChange?: (enabled: boolean) => void;
  spendMode: AiSpendMode;
  onSpendModeChange: (mode: AiSpendMode) => void;
  balance: number;
  onAdjustCredits?: (delta: number) => void;
  /**
   * Class scope only — whether BYOK usage (institution/class own keys) draws
   * down this class's limit. Undefined hides the toggles (no wallet exists
   * yet; the flags live on the wallet row).
   */
  byokCounting?: ByokCounting;
  onByokCountingChange?: (next: ByokCounting) => void;
  readOnly?: boolean;
}

/**
 * The single place platform AI credits are configured for a scope
 * (institution or class): access toggle, then (while on) a Credit Limits
 * select, then (while Limited) the balance + add/reduce control. No wallet
 * row needs to exist ahead of time — "no wallet" is treated as unrestricted,
 * so one is created transparently the first time the admin switches to
 * Limited (see createWalletResultAction). Dual-debit cap model: at
 * institution scope the balance is the pool of real credits; at class scope
 * it is the class's remaining spending limit, drawn down in lockstep with the
 * pool. BYOK usage never spends institution credits, but a class limit can
 * opt in to counting it via the two BYOK toggles (class scope, Limited only).
 */
export default function AiAccessAndLimitCard({
  scope,
  accessEnabled,
  onAccessEnabledChange,
  spendMode,
  onSpendModeChange,
  balance,
  onAdjustCredits,
  byokCounting,
  onByokCountingChange,
  readOnly = false,
}: AiAccessAndLimitCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {scope === "institution" ? "Institution Platform Credits" : "Class Platform Credits"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <Label className="text-sm font-normal">
            {scope === "institution"
              ? "Allow Institution to use Platform Credits"
              : "Allow Class to use Institution's Platform Credits"}
          </Label>
          <Switch
            checked={accessEnabled}
            onCheckedChange={onAccessEnabledChange}
            disabled={readOnly}
          />
        </div>

        {accessEnabled && (
          <div className="flex items-center justify-between gap-4">
            <Label className="text-sm font-normal">Platform Credit Limits</Label>
            <Select
              value={spendMode}
              onValueChange={(v) => onSpendModeChange(v as AiSpendMode)}
              disabled={readOnly}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unbounded">Unbounded</SelectItem>
                <SelectItem value="limited">Limited</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {accessEnabled && spendMode === "limited" && (
          <div className="flex items-center justify-between gap-4">
            <Label className="text-sm font-normal">
              {scope === "institution"
                ? "Available Platform Credits"
                : "Remaining Spending Limit"}
            </Label>
            <CreditAdjustControl
              balance={balance}
              disabled={readOnly}
              onAdjust={onAdjustCredits ?? (() => {})}
            />
          </div>
        )}

        {accessEnabled &&
          spendMode === "limited" &&
          scope === "class" &&
          byokCounting && (
            <>
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <Label className="text-sm font-normal">
                    Count institution key (BYOK) usage toward this limit
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Usage served by the institution&apos;s own API keys draws down
                    this class limit. It never spends institution AI credits.
                  </p>
                </div>
                <Switch
                  checked={byokCounting.countInstitutionByok}
                  onCheckedChange={(checked) =>
                    onByokCountingChange?.({
                      ...byokCounting,
                      countInstitutionByok: checked,
                    })
                  }
                  disabled={readOnly}
                />
              </div>
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <Label className="text-sm font-normal">
                    Count class key (BYOK) usage toward this limit
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Usage served by this class&apos;s own API keys draws down this
                    class limit.
                  </p>
                </div>
                <Switch
                  checked={byokCounting.countClassByok}
                  onCheckedChange={(checked) =>
                    onByokCountingChange?.({
                      ...byokCounting,
                      countClassByok: checked,
                    })
                  }
                  disabled={readOnly}
                />
              </div>
            </>
          )}
      </CardContent>
    </Card>
  );
}
