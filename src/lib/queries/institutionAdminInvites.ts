import { createClient } from "@/lib/supabase";

export interface InstitutionAdminInvite {
  id: string;
  institution_id: string;
  created_by: string;
  expires_at: string;
  revoked_at: string | null;
  max_uses: number | null;
  uses: number;
  created_at: string;
  updated_at: string;
  /** Plaintext token. Only visible to admins of this institution via RLS. */
  token: string | null;
}

const INVITE_COLUMNS =
  "id, institution_id, created_by, expires_at, revoked_at, max_uses, uses, created_at, updated_at, token";

/**
 * Create or regenerate the institution's invite link.
 *
 * The RPC enforces caller authorization (super admin or existing institution
 * admin). Returns the plaintext token; build the full URL on the client.
 */
export async function createInstitutionAdminInvite(params: {
  institutionId: string;
  expiresAtIso?: string;
}): Promise<string> {
  const supabase = createClient();
  const args: Record<string, unknown> = {
    p_institution_id: params.institutionId,
    // unlimited uses
    p_max_uses: null,
  };
  if (params.expiresAtIso) {
    args.p_expires_at = params.expiresAtIso;
  }
  const { data, error } = await supabase.rpc(
    "create_institution_admin_invite",
    args,
  );
  if (error) throw error;
  return data as string;
}

export async function revokeInstitutionAdminInvite(
  inviteId: string,
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("revoke_institution_admin_invite", {
    p_invite_id: inviteId,
  });
  if (error) throw error;
}

/**
 * Accept an invite token. Returns the institution UUID for redirecting.
 * Idempotent: already-admins get the institution id back, no error.
 */
export async function acceptInstitutionAdminInvite(
  token: string,
): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc(
    "accept_institution_admin_invite",
    { p_token: token },
  );
  if (error) throw error;
  return data as string;
}

/**
 * Fetch the current invite row for an institution (single row per
 * institution, enforced by a unique index). Returns null when no invite
 * has been generated yet.
 */
export async function getInstitutionAdminInvite(
  institutionId: string,
): Promise<InstitutionAdminInvite | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("institution_admin_invites")
    .select(INVITE_COLUMNS)
    .eq("institution_id", institutionId)
    .maybeSingle();
  if (error) throw error;
  return (data as InstitutionAdminInvite | null) ?? null;
}
