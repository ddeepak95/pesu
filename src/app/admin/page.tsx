import { redirect } from "next/navigation";

import PageLayout from "@/components/PageLayout";
import InstitutionCard from "@/components/Platform/InstitutionCard";
import { verifySession } from "@/lib/dal";
import {
  countActiveClassesByInstitution,
  listInstitutions,
} from "@/lib/queries/institutions";

export const metadata = {
  title: "Institution admin",
};

/**
 * Landing page for institution admins (and super admins) at `/admin`.
 *
 * RLS on `public.institutions` (phase D) already filters the visible rows to
 * the institutions the viewer can admin, so a single `listInstitutions` call
 * works for both viewer types:
 *   * super admins see every institution,
 *   * institution admins see only their own.
 *
 * If a non-super-admin admins exactly one institution we redirect straight to
 * its detail page so the single-org case is one click shorter.
 */
export default async function AdminLandingPage() {
  const { user, supabase } = await verifySession();

  const { data: superRow } = await supabase
    .from("platform_super_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  const isSuper = !!superRow;

  const institutions = await listInstitutions(supabase);

  if (!isSuper && institutions.length === 1) {
    redirect(`/admin/institutions/${institutions[0].id}?tab=settings`);
  }

  const classCounts =
    institutions.length > 0
      ? await countActiveClassesByInstitution(supabase)
      : new Map<string, number>();

  return (
    <PageLayout>
      <div className="space-y-12">
        <header>
          <h1 className="text-2xl font-semibold">Institution admin</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {isSuper
              ? "All institutions in the platform."
              : "Institutions where you have admin access."}
          </p>
        </header>

        {institutions.length === 0 ? (
          <div className="rounded border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">
            No institution associated with your account.
          </div>
        ) : (
          <section className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-lg font-medium">
                Institutions ({institutions.length})
              </h2>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {institutions.map((inst) => (
                <InstitutionCard
                  key={inst.id}
                  institution={inst}
                  classCount={classCounts.get(inst.id) ?? 0}
                  detailHrefBase="/admin/institutions"
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </PageLayout>
  );
}
