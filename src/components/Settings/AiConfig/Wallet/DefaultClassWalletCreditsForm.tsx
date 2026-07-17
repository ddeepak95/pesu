"use client";

import { useState, useTransition } from "react";
import { Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useTrackedRouter } from "@/hooks/useTrackedRouter";
import { setDefaultClassWalletCreditsResultAction } from "@/lib/ai/metering/actions";
import type {
  AiSpendMode,
  ByokCounting,
} from "@/components/Settings/AiConfig/AiAccessAndLimitCard";
import type { DefaultClassWalletSettings } from "@/lib/queries/aiCreditWallets";

interface DefaultClassWalletCreditsFormProps {
  institutionId: string;
  defaultSettings: DefaultClassWalletSettings;
}

/**
 * Defaults a newly created class's auto-provisioned wallet starts with
 * (seed_class_ai_credit_wallet trigger): the credit limit plus the two BYOK
 * counting flags. `credits: null` = unbounded — the new class gets no wallet
 * row, which also leaves the BYOK flags inert (no cap = nothing to count).
 * Unlike the wallet cards, "Available Credits" here is just a plain settable
 * number (there's no real wallet/balance to add to yet — the class doesn't
 * exist), so edits go through a dialog that sets an absolute value rather
 * than a delta.
 */
export default function DefaultClassWalletCreditsForm({
  institutionId,
  defaultSettings,
}: DefaultClassWalletCreditsFormProps) {
  const router = useTrackedRouter();
  const [mode, setMode] = useState<AiSpendMode>(
    defaultSettings.credits == null ? "unbounded" : "limited",
  );
  const [credits, setCredits] = useState(defaultSettings.credits ?? 0);
  const [byokCounting, setByokCounting] = useState<ByokCounting>({
    countInstitutionByok: defaultSettings.countInstitutionByok,
    countClassByok: defaultSettings.countClassByok,
  });
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editValue, setEditValue] = useState("");

  const save = (
    next: { credits: number | null } & ByokCounting,
    onFail: () => void,
  ) => {
    setError(null);
    startTransition(async () => {
      const result = await setDefaultClassWalletCreditsResultAction({
        institutionId,
        ...next,
      });
      if (!result.ok) {
        onFail();
        setError(result.error ?? "Failed to save");
        return;
      }
      router.refresh();
    });
  };

  const handleModeChange = (next: AiSpendMode) => {
    const previous = mode;
    setMode(next);
    save(
      { credits: next === "unbounded" ? null : credits, ...byokCounting },
      () => setMode(previous),
    );
    if (next === "limited" && credits === 0) {
      setEditValue("0");
      setEditOpen(true);
    }
  };

  const handleByokCountingChange = (next: ByokCounting) => {
    const previous = byokCounting;
    setByokCounting(next);
    save({ credits, ...next }, () => setByokCounting(previous));
  };

  const openEdit = () => {
    setEditValue(credits.toString());
    setEditOpen(true);
  };

  const confirmEdit = () => {
    const value = Number(editValue) || 0;
    const previous = credits;
    setCredits(value);
    save({ credits: value, ...byokCounting }, () => setCredits(previous));
    setEditOpen(false);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
        <CardTitle>Class Default AI Credit Limit</CardTitle>
        <Select
          value={mode}
          onValueChange={(v) => handleModeChange(v as AiSpendMode)}
          disabled={pending}
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="unbounded">Unbounded</SelectItem>
            <SelectItem value="limited">Limited</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      {(mode === "limited" || error) && (
        <CardContent className="space-y-2">
          {mode === "limited" && (
            <div className="flex items-center justify-between gap-4">
              <Label className="text-sm font-normal">Available AI Credits</Label>
              <div className="flex items-center gap-2">
                <div className="w-28 rounded-md border px-3 py-1.5 text-sm">
                  {credits.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  disabled={pending}
                  onClick={openEdit}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
          {mode === "limited" && (
            <>
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <Label className="text-sm font-normal">
                    Count institution key (BYOK) usage toward this limit
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Usage served by the institution&apos;s own API keys draws down
                    the class limit. It never spends institution AI credits.
                  </p>
                </div>
                <Switch
                  checked={byokCounting.countInstitutionByok}
                  onCheckedChange={(checked) =>
                    handleByokCountingChange({
                      ...byokCounting,
                      countInstitutionByok: checked,
                    })
                  }
                  disabled={pending}
                />
              </div>
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <Label className="text-sm font-normal">
                    Count class key (BYOK) usage toward this limit
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Usage served by a class&apos;s own API keys draws down that
                    class&apos;s limit.
                  </p>
                </div>
                <Switch
                  checked={byokCounting.countClassByok}
                  onCheckedChange={(checked) =>
                    handleByokCountingChange({
                      ...byokCounting,
                      countClassByok: checked,
                    })
                  }
                  disabled={pending}
                />
              </div>
            </>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      )}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Default platform credit limit</DialogTitle>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="default-class-credits-amount">Amount</Label>
            <Input
              id="default-class-credits-amount"
              type="number"
              min="0"
              step="any"
              autoFocus
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") confirmEdit();
              }}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={confirmEdit}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
