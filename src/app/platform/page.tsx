import Link from "next/link";
import PageLayout from "@/components/PageLayout";
import { requireSuperAdmin } from "@/lib/dal";
import {
  listInstitutions,
  listClassMoves,
  getUserEmailsByIds,
} from "@/lib/queries/institutions";
import {
  createInstitutionAction,
  moveClassAction,
} from "./actions";

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

  const [institutions, recentMoves] = await Promise.all([
    listInstitutions(supabase),
    listClassMoves(supabase, { limit: 25 }),
  ]);

  // Resolve moved_by user ids -> emails for the audit list.
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
            <code className="mx-1 rounded bg-muted px-1 py-0.5 text-xs">platform_super_admins</code>.
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
          <h2 className="text-lg font-medium">Institutions</h2>
          <div className="overflow-x-auto rounded border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Slug</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Default</th>
                  <th className="px-3 py-2 font-medium">Created</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {institutions.map((inst) => (
                  <tr key={inst.id} className="border-t">
                    <td className="px-3 py-2 font-medium">{inst.name}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {inst.slug ?? "—"}
                    </td>
                    <td className="px-3 py-2">{inst.status}</td>
                    <td className="px-3 py-2">{inst.is_default ? "yes" : "no"}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {new Date(inst.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        href={`/platform/institutions/${inst.id}`}
                        className="text-primary hover:underline"
                      >
                        Manage
                      </Link>
                    </td>
                  </tr>
                ))}
                {institutions.length === 0 && (
                  <tr>
                    <td className="px-3 py-6 text-center text-muted-foreground" colSpan={6}>
                      No institutions yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <details className="rounded border p-4">
            <summary className="cursor-pointer text-sm font-medium">
              Create institution
            </summary>
            <form action={createInstitutionAction} className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col text-sm">
                <span className="mb-1">Name *</span>
                <input
                  name="name"
                  required
                  className="rounded border px-2 py-1.5 text-sm"
                  placeholder="Acme University"
                />
              </label>
              <label className="flex flex-col text-sm">
                <span className="mb-1">Slug</span>
                <input
                  name="slug"
                  className="rounded border px-2 py-1.5 text-sm"
                  placeholder="acme"
                />
              </label>
              <div className="sm:col-span-2">
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
          <h2 className="text-lg font-medium">Move class</h2>
          <p className="text-muted-foreground text-sm">
            Update <code className="rounded bg-muted px-1 py-0.5 text-xs">classes.institution_id</code>{" "}
            via the audited <code className="rounded bg-muted px-1 py-0.5 text-xs">move_class_to_institution</code> RPC.
          </p>
          <form action={moveClassAction} className="grid gap-3 sm:grid-cols-3 rounded border p-4">
            <label className="flex flex-col text-sm sm:col-span-1">
              <span className="mb-1">Class id (uuid) *</span>
              <input
                name="classDbId"
                required
                className="rounded border px-2 py-1.5 text-sm"
                placeholder="00000000-0000-0000-0000-000000000000"
              />
            </label>
            <label className="flex flex-col text-sm sm:col-span-1">
              <span className="mb-1">Target institution *</span>
              <select
                name="targetInstitutionId"
                required
                className="rounded border px-2 py-1.5 text-sm"
              >
                <option value="">Select…</option>
                {institutions.map((inst) => (
                  <option key={inst.id} value={inst.id}>
                    {inst.name}
                    {inst.is_default ? " (default)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col text-sm sm:col-span-1">
              <span className="mb-1">Reason</span>
              <input
                name="reason"
                className="rounded border px-2 py-1.5 text-sm"
                placeholder="onboarding"
              />
            </label>
            <div className="sm:col-span-3">
              <button
                type="submit"
                className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                Move class
              </button>
            </div>
          </form>
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
                      <td className="px-3 py-2 font-mono text-xs">{m.class_id}</td>
                      <td className="px-3 py-2">
                        {institutionNameById.get(m.from_institution_id) ?? m.from_institution_id}
                      </td>
                      <td className="px-3 py-2">
                        {institutionNameById.get(m.to_institution_id) ?? m.to_institution_id}
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
