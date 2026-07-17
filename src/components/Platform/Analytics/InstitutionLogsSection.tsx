import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import AppLogsTable from "@/components/Platform/AppLogsTable";
import AppLogsFilterBar from "@/components/Platform/AppLogsFilterBar";
import type { AppLogRow } from "@/lib/queries/appLogs";

/**
 * Modular "Logs" card for the institution Analytics-and-Logs tab. Server-friendly
 * (the filter bar is a plain GET form, the table is presentational). Shows the
 * recent app_logs slice already scoped + capped by the page loader.
 */
export default function InstitutionLogsSection({
  appLogs,
  logFilters,
  institutionBaseHref,
}: {
  appLogs: AppLogRow[];
  logFilters: { level?: string; source?: string };
  institutionBaseHref: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Logs</CardTitle>
        <CardDescription>
          Recent server-side events and errors for this institution (latest 20).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <AppLogsFilterBar
          action={institutionBaseHref}
          level={logFilters.level}
          source={logFilters.source}
          hiddenFields={{ tab: "analytics" }}
        />
        <AppLogsTable logs={appLogs} />
      </CardContent>
    </Card>
  );
}
