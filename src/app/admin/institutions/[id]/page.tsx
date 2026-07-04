import { notFound } from "next/navigation";

import PageLayout from "@/components/PageLayout";
import InstitutionDetailView from "@/components/Platform/InstitutionDetailView";
import { requireInstitutionAdminOrSuper } from "@/lib/dal";
import {
  getInstitution,
  getInstitutionMemberEmails,
  getUserEmailsByIds,
  listClassesInInstitution,
  listClassMoves,
  listInstitutionMembers,
  listInstitutions,
} from "@/lib/queries/institutions";
import { getInstitutionAiPolicy } from "@/lib/queries/aiInstitutionSettings";
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

  const [members, classes, moves, allInstitutions, effectiveSettings, institutionPolicy] =
    await Promise.all([
      listInstitutionMembers(supabase, id),
      listClassesInInstitution(supabase, id),
      listClassMoves(supabase, { institutionId: id, limit: 25 }),
      listInstitutions(supabase),
      getEffectiveSettingsForInstitution(supabase, id),
      getInstitutionAiPolicy(supabase, id),
    ]);

  const memberIds = members.map((m) => m.user_id);
  const moverIds = moves.map((m) => m.moved_by);
  const allUserIds = Array.from(new Set([...memberIds, ...moverIds]));
  // Super admins use the unrestricted `get_users_by_ids` RPC (covers members
  // and move audit rows). Institution admins fall back to the per-institution
  // member-email RPC, which is gated to the same institution and only
  // resolves emails for its own members — sufficient for the admins table.
  const userEmails =
    viewerRole === "super_admin"
      ? await getUserEmailsByIds(supabase, allUserIds)
      : await getInstitutionMemberEmails(supabase, id);

  const userEmailEntries: Array<[string, string]> = Array.from(
    userEmails.entries(),
  );
  const institutionNameEntries: Array<[string, string]> = allInstitutions.map(
    (inst) => [inst.id, inst.name],
  );

  // Only render the back link when the viewer has somewhere meaningful to go.
  // Single-institution admins are auto-redirected from `/admin` to here, so
  // pointing back there would just bounce them right back; omit the link in
  // that case. Multi-institution admins and super admins get a back link to
  // the `/admin` grid (super admins can also reach `/platform` via direct nav).
  const showBackLink = allInstitutions.length > 1;

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
        backHref={showBackLink ? "/admin" : undefined}
        backLabel={showBackLink ? "Back to institutions" : undefined}
        effectiveSettings={effectiveSettings}
        institutionPolicy={institutionPolicy}
        classOverrideHrefBase={`/admin/institutions/${id}/classes`}
        notice={{ ok, error }}
        activityTemplatesManageHref={`/admin/institutions/${id}/activity-templates`}
      />
    </PageLayout>
  );
}
