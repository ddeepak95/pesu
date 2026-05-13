import PageLayout from "@/components/PageLayout";
import InstitutionCard from "@/components/Platform/InstitutionCard";
import { requireSuperAdmin } from "@/lib/dal";
import {
  countActiveClassesByInstitution,
  getUserEmailsByIds,
  listClassMoves,
  listInstitutions,
} from "@/lib/queries/institutions";

import { createInstitutionAction } from "./actions";

export const metadata = {
  title: "Platform admin",
};

export default async function PlatformPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { supabase } = await requireSuperAdmin();
  const { ok: okMsg, error: errorMsg } = await searchParams;

  const [institutions, recentMoves, classCounts] = await Promise.all([
    listInstitutions(supabase),
    listClassMoves(supabase, { limit: 25 }),
    countActiveClassesByInstitution(supabase),
  ]);

  const moverIds = Array.from(new Set(recentMoves.map((m) => m.moved_by)));
  const moverEmails = await getUserEmailsByIds(supabase, moverIds);

  const institutionNameById = new Map<string, string>();
  for (const inst of institutions) {
    institutionNameById.set(inst.id, inst.name);
  }

  return (
    <PageLayout>
      <div className="space-y-12">
        <header>
          <h1 className="text-2xl font-semibold">Platform admin</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Internal super-admin tools. Visible only to users in
            <code className="mx-1 rounded bg-muted px-1 py-0.5 text-xs">
              platform_super_admins
            </code>
            .
          </p>
        </header>

        {(okMsg || errorMsg) && (
          <div
            className={`rounded border px-4 py-3 text-sm ${
              errorMsg
                ? "border-destructive/40 bg-destructive/10 text-destructive"
                : "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
            }`}
          >
            {errorMsg ?? okMsg}
          </div>
        )}

        <section className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-lg font-medium">
              Institutions ({institutions.length})
            </h2>
          </div>

          {institutions.length === 0 ? (
            <div className="rounded border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">
              No institutions yet. Use the form below to create one.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {institutions.map((inst) => (
                <InstitutionCard
                  key={inst.id}
                  institution={inst}
                  classCount={classCounts.get(inst.id) ?? 0}
                  detailHrefBase="/platform/institutions"
                />
              ))}
            </div>
          )}

          <details className="rounded border p-4">
            <summary className="cursor-pointer text-sm font-medium">
              Create institution
            </summary>
            <form action={createInstitutionAction} className="mt-3 space-y-3">
              <label className="flex flex-col text-sm">
                <span className="mb-1">Name *</span>
                <input
                  name="name"
                  required
                  className="rounded border px-2 py-1.5 text-sm"
                  placeholder="Acme University"
                />
              </label>
              <div>
                <button
                  type="submit"
                  className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
                >
                  Create institution
                </button>
              </div>
            </form>
          </details>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-medium">Recent class moves</h2>
          {recentMoves.length === 0 ? (
            <p className="text-muted-foreground text-sm">No moves recorded.</p>
          ) : (
            <div className="overflow-x-auto rounded border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th className="px-3 py-2 font-medium">When</th>
                    <th className="px-3 py-2 font-medium">Class</th>
                    <th className="px-3 py-2 font-medium">From</th>
                    <th className="px-3 py-2 font-medium">To</th>
                    <th className="px-3 py-2 font-medium">By</th>
                    <th className="px-3 py-2 font-medium">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {recentMoves.map((m) => (
                    <tr key={m.id} className="border-t">
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                        {new Date(m.created_at).toLocaleString()}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {m.class_id}
                      </td>
                      <td className="px-3 py-2">
                        {institutionNameById.get(m.from_institution_id) ??
                          m.from_institution_id}
                      </td>
                      <td className="px-3 py-2">
                        {institutionNameById.get(m.to_institution_id) ??
                          m.to_institution_id}
                      </td>
                      <td className="px-3 py-2">
                        {moverEmails.get(m.moved_by) ?? m.moved_by}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {m.reason ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </PageLayout>
  );
}
