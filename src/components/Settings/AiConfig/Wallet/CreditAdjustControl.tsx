"use client";

import { useState } from "react";
import { Minus, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface CreditAdjustControlProps {
  balance: number;
  disabled?: boolean;
  /** Positive to add, negative to reduce. */
  onAdjust: (delta: number) => void;
}

type PendingSign = "add" | "subtract" | null;

/** Balance display + a "+"/"-" pair that each open a dialog to enter an amount to add/reduce. */
export default function CreditAdjustControl({
  balance,
  disabled,
  onAdjust,
}: CreditAdjustControlProps) {
  const [sign, setSign] = useState<PendingSign>(null);
  const [amount, setAmount] = useState("");

  const close = () => {
    setSign(null);
    setAmount("");
  };

  const confirm = () => {
    const n = Number(amount);
    if (Number.isFinite(n) && n > 0) {
      onAdjust(sign === "subtract" ? -n : n);
    }
    close();
  };

  return (
    <div className="flex items-center gap-2">
      <div className="w-28 rounded-md border px-3 py-1.5 text-sm">
        {balance.toLocaleString(undefined, { maximumFractionDigits: 2 })}
      </div>
      <Button
        type="button"
        size="icon"
        variant="outline"
        disabled={disabled}
        onClick={() => setSign("subtract")}
      >
        <Minus className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        size="icon"
        variant="outline"
        disabled={disabled}
        onClick={() => setSign("add")}
      >
        <Plus className="h-4 w-4" />
      </Button>

      <Dialog open={sign !== null} onOpenChange={(open) => !open && close()}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>
              {sign === "subtract" ? "Reduce credits" : "Add credits"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="credit-adjust-amount">Amount</Label>
            <Input
              id="credit-adjust-amount"
              type="number"
              min="0"
              step="any"
              autoFocus
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") confirm();
              }}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button type="button" onClick={confirm}>
              {sign === "subtract" ? "Reduce" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
