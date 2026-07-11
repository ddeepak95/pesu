import Link from "next/link";
import { notFound } from "next/navigation";

import PageLayout from "@/components/PageLayout";
import AppLogsTable from "@/components/Platform/AppLogsTable";
import AppLogsFilterBar from "@/components/Platform/AppLogsFilterBar";
import { requireInstitutionAdminOrSuper } from "@/lib/dal";
import { getInstitution } from "@/lib/queries/institutions";
import { listAppLogs } from "@/lib/queries/appLogs";

export const metadata = {
  title: "Institution logs",
};

function normalizeLevel(v?: string): "info" | "warn" | "error" | undefined {
  return v === "info" || v === "warn" || v === "error" ? v : undefined;
}

export default async function InstitutionLogsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ level?: string; source?: string }>;
}) {
  const { id } = await params;
  const { supabase } = await requireInstitutionAdminOrSuper(id);
  const { level, source } = await searchParams;

  const institution = await getInstitution(supabase, id);
  if (!institution) notFound();

  // RLS already scopes rows to this viewer's institution; the explicit filter
  // narrows to this institution page even for a super admin who admins several.
  const logs = await listAppLogs(supabase, {
    level: normalizeLevel(level),
    source: source || undefined,
    institutionId: id,
  });

  return (
    <PageLayout>
      <div className="space-y-6">
        <header>
          <Link
            href={`/admin/institutions/${id}`}
            className="text-muted-foreground hover:text-foreground text-sm"
          >
            &larr; Back to institution
          </Link>
          <h1 className="text-2xl font-semibold mt-2">
            Logs — {institution.name}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Server-side events and errors for this institution. Terminal AI
            failures (<code>error</code>) and self-healing silent retries (
            <code>warn</code>) surface here.
          </p>
        </header>

        <AppLogsFilterBar
          action={`/admin/institutions/${id}/logs`}
          level={level}
          source={source}
        />

        <AppLogsTable logs={logs} />
      </div>
    </PageLayout>
  );
}
