"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { AiSpendMode } from "@/components/Settings/AiConfig/AiAccessAndLimitCard";

interface CreditAvailabilityCardProps {
  scope: "institution" | "class";
  /** Whether this scope currently has access to the parent's AI credits at all. */
  accessEnabled: boolean;
  spendMode: AiSpendMode;
  /** Remaining balance — how much is available to spend right now. */
  balance: number;
}

/**
 * Only Unbounded and the access-disabled case get explanatory copy — Limited
 * is fully explained by the balance figure itself. Dual-debit cap model: a
 * class's balance is its remaining spending limit (usage also draws down the
 * institution's credit pool); an uncapped class draws from the pool directly.
 */
function creditAvailabilityDescription(
  scope: "institution" | "class",
  accessEnabled: boolean,
  spendMode: AiSpendMode,
): string | null {
  const child = scope === "class" ? "class" : "institution";
  const parent = scope === "class" ? "institution" : "platform";
  if (!accessEnabled) {
    return `This ${child} is using its own AI configuration, not ${parent}'s AI credits.`;
  }
  if (spendMode === "unbounded") {
    if (scope === "class") {
      return "This class draws from the institution's credit pool without a class-specific limit.";
    }
    return `Your ${child} has unbounded access to ${parent}'s AI credits.`;
  }
  return null;
}

export default function CreditAvailabilityCard({
  scope,
  accessEnabled,
  spendMode,
  balance,
}: CreditAvailabilityCardProps) {
  const description = creditAvailabilityDescription(scope, accessEnabled, spendMode);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>AI Credit Availability</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        <p
          className={cn(
            "text-3xl font-semibold",
            spendMode !== "unbounded" && balance < 0 && "text-destructive",
          )}
        >
          {spendMode === "unbounded" ? (
            <>
              Unbounded{" "}
              <span className="text-base font-normal text-muted-foreground">
                AI Credits Available
              </span>
            </>
          ) : (
            <>
              {balance.toLocaleString(undefined, { maximumFractionDigits: 2 })}{" "}
              <span className="text-base font-normal text-muted-foreground">
                AI Credits Available
              </span>
            </>
          )}
        </p>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </CardContent>
    </Card>
  );
}
