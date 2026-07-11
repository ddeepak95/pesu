import Link from "next/link";

import PageLayout from "@/components/PageLayout";
import AppLogsTable from "@/components/Platform/AppLogsTable";
import AppLogsFilterBar from "@/components/Platform/AppLogsFilterBar";
import { requireSuperAdmin } from "@/lib/dal";
import { listAppLogs } from "@/lib/queries/appLogs";

export const metadata = {
  title: "Platform logs",
};

function normalizeLevel(v?: string): "info" | "warn" | "error" | undefined {
  return v === "info" || v === "warn" || v === "error" ? v : undefined;
}

export default async function PlatformLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ level?: string; source?: string }>;
}) {
  const { supabase } = await requireSuperAdmin();
  const { level, source } = await searchParams;

  const logs = await listAppLogs(supabase, {
    level: normalizeLevel(level),
    source: source || undefined,
  });

  return (
    <PageLayout>
      <div className="space-y-6">
        <header>
          <Link
            href="/platform"
            className="text-muted-foreground hover:text-foreground text-sm"
          >
            &larr; Back to platform admin
          </Link>
          <h1 className="text-2xl font-semibold mt-2">Platform logs</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Server-side events and errors across all institutions. Terminal AI
            failures (<code>error</code>) and self-healing silent retries (
            <code>warn</code>) surface here.
          </p>
        </header>

        <AppLogsFilterBar action="/platform/logs" level={level} source={source} />

        <AppLogsTable logs={logs} />
      </div>
    </PageLayout>
  );
}
