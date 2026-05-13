import { notFound } from "next/navigation";

import PageLayout from "@/components/PageLayout";
import InstitutionDetailView from "@/components/Platform/InstitutionDetailView";
import { requireInstitutionAdminOrSuper } from "@/lib/dal";
import {
  getInstitution,
  getUserEmailsByIds,
  listClassesInInstitution,
  listClassMoves,
  listInstitutionMembers,
  listInstitutions,
} from "@/lib/queries/institutions";
import { getEffectiveSettingsForInstitution } from "@/lib/queries/settings";

export const metadata = {
  title: "Institution admin",
};

/**
 * Institution-admin landing page. Renders the same `InstitutionDetailView`
 * as `/platform/institutions/[id]` but with `viewerRole="institution_admin"`
 * (or `"super_admin"` when a platform super admin lands here, since they
 * always pass the institution-admin gate).
 */
export default async function AdminInstitutionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { id } = await params;
  const { ok, error } = await searchParams;
  const { supabase, viewerRole } = await requireInstitutionAdminOrSuper(id);

  const institution = await getInstitution(supabase, id);
  if (!institution) notFound();

  const [members, classes, moves, allInstitutions, effectiveSettings] =
    await Promise.all([
      listInstitutionMembers(supabase, id),
      listClassesInInstitution(supabase, id),
      listClassMoves(supabase, { institutionId: id, limit: 25 }),
      listInstitutions(supabase),
      getEffectiveSettingsForInstitution(supabase, id),
    ]);

  const memberIds = members.map((m) => m.user_id);
  const moverIds = moves.map((m) => m.moved_by);
  const allUserIds = Array.from(new Set([...memberIds, ...moverIds]));
  // get_users_by_ids is super-admin-only; institution admins cannot resolve
  // emails. Fall back to an empty map to keep the page rendering.
  const userEmails =
    viewerRole === "super_admin"
      ? await getUserEmailsByIds(supabase, allUserIds)
      : new Map<string, string>();

  const userEmailEntries: Array<[string, string]> = Array.from(
    userEmails.entries(),
  );
  const institutionNameEntries: Array<[string, string]> = allInstitutions.map(
    (inst) => [inst.id, inst.name],
  );

  return (
    <PageLayout>
      <InstitutionDetailView
        institution={institution}
        members={members}
        classes={classes}
        moves={moves}
        userEmailEntries={userEmailEntries}
        institutionNameEntries={institutionNameEntries}
        viewerRole={viewerRole}
        backHref="/teacher"
        backLabel="Back to teacher dashboard"
        effectiveSettings={effectiveSettings}
        classOverrideHrefBase={`/admin/institutions/${id}/classes`}
        notice={{ ok, error }}
      />
    </PageLayout>
  );
}
