"use client";

import { useState, useTransition } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getUsageForMonthAction } from "@/lib/ai/metering/actions";
import { listRecentUsageMonths } from "@/lib/ai/metering/usageMonths";
import type { UsageBreakdownRow, WalletFundingEntry } from "@/lib/queries/aiUsage";

import ModalityBreakdownCard from "./ModalityBreakdownCard";

interface UsageOverviewProps {
  institutionId: string;
  /** Class scope only. */
  classId?: string | null;
  /** This month's breakdown, fetched server-side for the initial render. */
  initialBreakdown: UsageBreakdownRow[];
  fundingHistory: WalletFundingEntry[];
}

/**
 * Real (not mocked) usage summary — a month picker and this month's
 * spend/calls broken down by modality. The "AI Credit Availability" card now
 * lives at the top of the AI management tab (CreditAvailabilityCard).
 */
export default function UsageOverview({
  institutionId,
  classId,
  initialBreakdown,
  fundingHistory,
}: UsageOverviewProps) {
  const months = listRecentUsageMonths();
  const [selectedMonth, setSelectedMonth] = useState(months[0]!.value);
  const [breakdown, setBreakdown] = useState(initialBreakdown);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleMonthChange = (value: string) => {
    setSelectedMonth(value);
    setError(null);
    startTransition(async () => {
      const result = await getUsageForMonthAction({
        institutionId,
        classId: classId ?? null,
        periodStart: value,
      });
      if (!result.ok || !result.breakdown) {
        setError(result.error ?? "Failed to load usage for that month");
        return;
      }
      setBreakdown(result.breakdown);
    });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">Usage By Month</h3>
          <Select value={selectedMonth} onValueChange={handleMonthChange}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {months.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className={`space-y-4 ${isPending ? "opacity-60" : ""}`}>
          <ModalityBreakdownCard
            title="By Credits"
            unitLabel="Credits"
            rows={breakdown}
            valueKey="credits"
          />
          <ModalityBreakdownCard
            title="By API Requests"
            unitLabel="Requests"
            rows={breakdown}
            valueKey="calls"
            formatValue={(v) => v.toLocaleString()}
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Funding history</CardTitle>
        </CardHeader>
        <CardContent>
          {fundingHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No credits granted yet.
            </p>
          ) : (
            <ul className="divide-y">
              {fundingHistory.map((entry) => (
                <li
                  key={entry.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                >
                  <div>
                    <span className="font-medium">
                      +{entry.credits.toLocaleString()} credits
                    </span>{" "}
                    <span className="text-muted-foreground">
                      ({entry.type})
                    </span>
                    {entry.note && (
                      <span className="text-muted-foreground">
                        {" "}
                        — {entry.note}
                      </span>
                    )}
                  </div>
                  <div className="text-muted-foreground">
                    {new Date(entry.createdAt).toLocaleDateString()}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
