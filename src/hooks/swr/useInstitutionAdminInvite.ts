import useSWR, { mutate } from "swr";

import {
  getInstitutionAdminInvite,
  type InstitutionAdminInvite,
} from "@/lib/queries/institutionAdminInvites";

/**
 * Fetch the single invite row for an institution. Returns `null` data when
 * no invite has been generated yet.
 */
export function useInstitutionAdminInvite(institutionId: string | null) {
  return useSWR<InstitutionAdminInvite | null>(
    institutionId ? ["institutionAdminInvite", institutionId] : null,
    () => getInstitutionAdminInvite(institutionId!),
  );
}

/**
 * Invalidate every cached institution-admin-invite read (call after
 * create/revoke). Mirrors the teacher-invite invalidator.
 */
export function invalidateInstitutionAdminInviteCache() {
  return mutate(
    (key) =>
      Array.isArray(key) &&
      typeof key[0] === "string" &&
      key[0] === "institutionAdminInvite",
  );
}
