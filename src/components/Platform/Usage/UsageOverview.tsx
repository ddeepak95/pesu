import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import UsageBreakdownTable, { type UsageBreakdownRow } from "./UsageBreakdownTable";
import UsageSummaryCards from "./UsageSummaryCards";
import type { WalletFundingEntry } from "@/lib/queries/aiUsage";

interface UsageOverviewProps {
  /** Sum of every platform-key_owner wallet balance in scope, 0 when unrestricted/no wallet. */
  balance: number;
  /** This calendar month, by modality — src/lib/queries/aiUsage.ts. */
  breakdown: UsageBreakdownRow[];
  fundingHistory: WalletFundingEntry[];
}

/**
 * Real (not mocked) usage summary — this month's spend by modality plus
 * funding history. The by-model/by-class/by-teacher/over-time cuts from the
 * main plan's §8.1 are follow-up work (they read ai_invocations directly,
 * a heavier query); this ships the cheap ai_usage_counters-backed cut first.
 */
export default function UsageOverview({
  balance,
  breakdown,
  fundingHistory,
}: UsageOverviewProps) {
  const spentThisPeriod = breakdown.reduce((sum, r) => sum + r.credits, 0);
  const callsThisPeriod = breakdown.reduce((sum, r) => sum + r.calls, 0);

  return (
    <div className="space-y-6">
      <UsageSummaryCards
        balance={balance}
        spentThisPeriod={spentThisPeriod}
        callsThisPeriod={callsThisPeriod}
      />

      <div className="space-y-3">
        <h3 className="text-sm font-semibold">This month, by modality</h3>
        <UsageBreakdownTable rows={breakdown} dimensionLabel="Modality" />
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
