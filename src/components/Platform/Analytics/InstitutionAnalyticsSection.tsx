"use client";

import { useState, useTransition } from "react";
import { BarChart3, Loader2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getInstitutionAnalyticsAction } from "@/lib/analytics/actions";
import type { InstitutionAnalytics } from "@/lib/queries/institutionAnalytics";

import ClassAnalyticsTable from "./ClassAnalyticsTable";

/**
 * Engagement analytics for an institution, loaded lazily. Nothing is fetched on
 * page landing — the heavy aggregation (turns over chat_messages) runs only when
 * the admin clicks "Load analytics", and the result is cached in state so
 * re-opening the tab doesn't re-fetch. "Recent" figures cover the last 7 days.
 * See dev-docs/institution-analytics-and-logs-plan.md.
 */
export default function InstitutionAnalyticsSection({
  institutionId,
}: {
  institutionId: string;
}) {
  const [analytics, setAnalytics] = useState<InstitutionAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const load = () => {
    setError(null);
    startTransition(async () => {
      const result = await getInstitutionAnalyticsAction({ institutionId });
      if (!result.ok || !result.analytics) {
        setError(result.error ?? "Failed to load analytics");
        return;
      }
      setAnalytics(result.analytics);
    });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="text-base">Engagement</CardTitle>
          <CardDescription>
            Counts are computed on demand. The muted <span>+N</span> figure is
            the last 7 days.
          </CardDescription>
        </div>
        {analytics === null ? (
          <Button size="sm" onClick={load} disabled={isPending}>
            {isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <BarChart3 className="mr-2 h-4 w-4" />
            )}
            {isPending ? "Loading…" : "Load analytics"}
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            onClick={load}
            disabled={isPending}
          >
            {isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Refresh
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <p className="text-sm text-destructive">{error}</p>}

        {analytics === null && !error && (
          <div className="rounded border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
            Load engagement analytics to see per-class activity, students, and
            conversation counts.
          </div>
        )}

        {analytics !== null && (
          <div className={isPending ? "opacity-60" : ""}>
            <div className="mb-4 inline-flex items-baseline gap-2 rounded border bg-muted/30 px-4 py-3">
              <span className="text-2xl font-semibold tabular-nums">
                {analytics.classesAdded.total.toLocaleString()}
              </span>
              <span className="text-sm text-muted-foreground">classes</span>
              {analytics.classesAdded.recent > 0 && (
                <span className="text-xs text-muted-foreground">
                  +{analytics.classesAdded.recent.toLocaleString()} this week
                </span>
              )}
            </div>
            <ClassAnalyticsTable rows={analytics.classes} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
