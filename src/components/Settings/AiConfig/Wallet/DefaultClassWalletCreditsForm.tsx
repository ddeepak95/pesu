"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTrackedRouter } from "@/hooks/useTrackedRouter";
import { setDefaultClassWalletCreditsResultAction } from "@/lib/ai/metering/actions";
import type { AiSpendMode } from "@/components/Settings/AiConfig/AiAccessAndLimitCard";

interface DefaultClassWalletCreditsFormProps {
  institutionId: string;
  defaultCredits: number | null;
}

/**
 * Credits a newly created class's auto-provisioned wallet starts with
 * (seed_class_ai_credit_wallet trigger). Null = unbounded — new classes get
 * an explicit `enforcement='off'` wallet instead. Unlike the wallet cards,
 * "Available Credits" here is just a plain settable number (there's no real
 * wallet/balance to add to yet — the class doesn't exist).
 */
export default function DefaultClassWalletCreditsForm({
  institutionId,
  defaultCredits,
}: DefaultClassWalletCreditsFormProps) {
  const router = useTrackedRouter();
  const [mode, setMode] = useState<AiSpendMode>(
    defaultCredits == null ? "unbounded" : "limited",
  );
  const [credits, setCredits] = useState(defaultCredits?.toString() ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleSave = () => {
    setError(null);
    const value = mode === "unbounded" ? null : Number(credits) || 0;
    startTransition(async () => {
      const result = await setDefaultClassWalletCreditsResultAction({
        institutionId,
        credits: value,
      });
      if (!result.ok) {
        setError(result.error ?? "Failed to save");
        return;
      }
      router.refresh();
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Class Default AI Credits</CardTitle>
        <CardDescription>Default settings for the class when it is created.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <Label className="text-sm font-normal">Credit Limits</Label>
          <Select
            value={mode}
            onValueChange={(v) => setMode(v as AiSpendMode)}
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
        </div>
        {mode === "limited" && (
          <div className="flex items-center justify-between gap-4">
            <Label className="text-sm font-normal">Available Credits</Label>
            <Input
              type="number"
              step="any"
              min="0"
              value={credits}
              onChange={(e) => setCredits(e.target.value)}
              disabled={pending}
              className="w-32"
            />
          </div>
        )}
        <Button type="button" size="sm" onClick={handleSave} disabled={pending}>
          {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
