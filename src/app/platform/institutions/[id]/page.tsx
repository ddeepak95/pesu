import Link from "next/link";
import { notFound } from "next/navigation";
import PageLayout from "@/components/PageLayout";
import { requireSuperAdmin } from "@/lib/dal";
import {
  getInstitution,
  listInstitutionMembers,
  listClassesInInstitution,
  listClassMoves,
  getUserEmailsByIds,
  listInstitutions,
} from "@/lib/queries/institutions";
import {
  addInstitutionAdminAction,
  removeInstitutionAdminAction,
} from "../../actions";

export const metadata = {
  title: "Institution",
};

export default async function InstitutionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { id } = await params;
  const { ok: okMsg, error: errorMsg } = await searchParams;
  const { supabase } = await requireSuperAdmin();

  const institution = await getInstitution(supabase, id);
  if (!institution) notFound();

  const [members, classes, moves, allInstitutions] = await Promise.all([
    listInstitutionMembers(supabase, id),
    listClassesInInstitution(supabase, id),
    listClassMoves(supabase, { institutionId: id, limit: 25 }),
    listInstitutions(supabase),
  ]);

  const memberIds = members.map((m) => m.user_id);
  const moverIds = moves.map((m) => m.moved_by);
  const allUserIds = Array.from(new Set([...memberIds, ...moverIds]));
  const userEmails = await getUserEmailsByIds(supabase, allUserIds);

  const institutionNameById = new Map<string, string>();
  for (const inst of allInstitutions) {
    institutionNameById.set(inst.id, inst.name);
  }

  return (
    <PageLayout>
      <div className="space-y-10">
        <div className="space-y-1">
          <Link
            href="/platform"
            className="text-muted-foreground hover:text-foreground text-sm"
          >
            &larr; Back to platform admin
          </Link>
          <h1 className="text-2xl font-semibold">{institution.name}</h1>
          <p className="text-muted-foreground text-sm">
            <code className="rounded bg-muted px-1 py-0.5 text-xs">
              {institution.id}
            </code>
            {institution.slug && (
              <>
                {" · "}slug{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-xs">
                  {institution.slug}
                </code>
              </>
            )}
            {" · "}status {institution.status}
            {institution.is_default && (
              <>
                {" · "}
                <span className="rounded bg-muted px-1.5 py-0.5 text-xs">
                  default
                </span>
              </>
            )}
          </p>
        </div>

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
          <h2 className="text-lg font-medium">Admins</h2>
          <div className="overflow-x-auto rounded border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Email</th>
                  <th className="px-3 py-2 font-medium">Role</th>
                  <th className="px-3 py-2 font-medium">Added</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id} className="border-t">
                    <td className="px-3 py-2">
                      {userEmails.get(m.user_id) ?? (
                        <span className="font-mono text-xs text-muted-foreground">
                          {m.user_id}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">{m.role}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {new Date(m.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <form action={removeInstitutionAdminAction}>
                        <input type="hidden" name="institutionId" value={id} />
                        <input type="hidden" name="userId" value={m.user_id} />
                        <button
                          type="submit"
                          className="text-destructive hover:underline"
                        >
                          Remove
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
                {members.length === 0 && (
                  <tr>
                    <td className="px-3 py-6 text-center text-muted-foreground" colSpan={4}>
                      No admins yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <form
            action={addInstitutionAdminAction}
            className="flex flex-wrap items-end gap-3 rounded border p-4"
          >
            <input type="hidden" name="institutionId" value={id} />
            <label className="flex flex-1 min-w-64 flex-col text-sm">
              <span className="mb-1">Add admin by email</span>
              <input
                name="email"
                type="email"
                required
                className="rounded border px-2 py-1.5 text-sm"
                placeholder="user@example.com"
              />
            </label>
            <button
              type="submit"
              className="rounded bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Add admin
            </button>
          </form>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-medium">
            Classes ({classes.length})
          </h2>
          {classes.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No classes under this institution.
            </p>
          ) : (
            <div className="overflow-x-auto rounded border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th className="px-3 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium">Short id</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Created</th>
                    <th className="px-3 py-2 font-medium">Class id (uuid)</th>
                  </tr>
                </thead>
                <tbody>
                  {classes.map((c) => (
                    <tr key={c.id} className="border-t">
                      <td className="px-3 py-2 font-medium">{c.name}</td>
                      <td className="px-3 py-2">
                        <Link
                          href={`/teacher/classes/${c.class_id}`}
                          className="text-primary hover:underline"
                        >
                          {c.class_id}
                        </Link>
                      </td>
                      <td className="px-3 py-2">{c.status}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {new Date(c.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                        {c.id}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-medium">Recent moves involving this institution</h2>
          {moves.length === 0 ? (
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
                  {moves.map((m) => (
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
                        {userEmails.get(m.moved_by) ?? m.moved_by}
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
