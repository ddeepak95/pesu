import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Class } from "@/types/class";
import { buildInstitutionScaffoldRows } from "@/lib/settings/scaffold";

const CLASS_COLUMNS =
  "id, name, class_id, created_by, created_at, updated_at, status, preferred_language, group_count, enable_progressive_unlock, student_assignment_strategy, progress_view_config, institution_id";

export interface Institution {
  id: string;
  name: string;
  slug: string | null;
  status: string;
  is_default: boolean;
  preferred_language: string;
  created_at: string;
  updated_at: string;
}

export interface InstitutionMember {
  id: string;
  institution_id: string;
  user_id: string;
  role: string;
  created_at: string;
}

export interface ClassInstitutionMove {
  id: string;
  class_id: string;
  from_institution_id: string;
  to_institution_id: string;
  moved_by: string;
  reason: string | null;
  created_at: string;
}

const INSTITUTION_COLUMNS =
  "id, name, slug, status, is_default, preferred_language, created_at, updated_at";

const MEMBER_COLUMNS =
  "id, institution_id, user_id, role, created_at";

const MOVE_COLUMNS =
  "id, class_id, from_institution_id, to_institution_id, moved_by, reason, created_at";

/**
 * Server-only queries for the internal super-admin surface at `/platform`.
 *
 * RLS gates everything — these helpers assume the caller has already passed
 * `requireSuperAdmin()`. Institution-admin readers also pass under the
 * institution-scoped read policies added in the Phase D migration.
 */
export async function listInstitutions(
  supabase: SupabaseClient
): Promise<Institution[]> {
  const { data, error } = await supabase
    .from("institutions")
    .select(INSTITUTION_COLUMNS)
    .order("is_default", { ascending: false })
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Institution[];
}

export async function getInstitution(
  supabase: SupabaseClient,
  id: string
): Promise<Institution | null> {
  const { data, error } = await supabase
    .from("institutions")
    .select(INSTITUTION_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as Institution | null) ?? null;
}

export async function createInstitution(
  supabase: SupabaseClient,
  input: { name: string; slug?: string | null; createdBy: string }
): Promise<Institution> {
  const payload: { name: string; slug?: string | null; status: string } = {
    name: input.name,
    status: "active",
  };
  if (input.slug && input.slug.trim().length > 0) {
    payload.slug = input.slug.trim();
  }

  const { data, error } = await supabase
    .from("institutions")
    .insert(payload)
    .select(INSTITUTION_COLUMNS)
    .single();
  if (error) throw error;

  const institution = data as Institution;
  await seedInstitutionScaffoldSettings(supabase, institution.id, input.createdBy);
  return institution;
}

/**
 * Seed the institution-owned default settings (registry entries declaring
 * `institutionScaffold`) with their correct lock columns. Idempotent: existing
 * rows are left untouched, so it is safe to call on create and again during a
 * backfill. Must run as super admin (the DB trigger only lets a super admin set
 * `allow_admin_edit = true`) — `createInstitution` is already super-admin-gated.
 */
export async function seedInstitutionScaffoldSettings(
  supabase: SupabaseClient,
  institutionId: string,
  userId: string | null
): Promise<void> {
  const rows = buildInstitutionScaffoldRows(institutionId, userId);
  if (rows.length === 0) return;
  const { error } = await supabase
    .from("setting_values")
    .upsert(rows, { onConflict: "scope,scope_id,key", ignoreDuplicates: true });
  if (error) throw error;
}

export async function listInstitutionMembers(
  supabase: SupabaseClient,
  institutionId: string
): Promise<InstitutionMember[]> {
  const { data, error } = await supabase
    .from("institution_members")
    .select(MEMBER_COLUMNS)
    .eq("institution_id", institutionId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as InstitutionMember[];
}

/**
 * Count classes under an institution across all statuses (active, archived,
 * deleted). This intentionally does not filter by status: `classes
 * .institution_id` has no `ON DELETE` action, so *any* class row — regardless
 * of status — blocks a hard delete at the FK level. The emptiness check has
 * to match that or callers would see a false "empty" signal followed by a
 * raw FK-violation error.
 */
export async function countClassesByInstitution(
  supabase: SupabaseClient,
  institutionId: string
): Promise<number> {
  const { count, error } = await supabase
    .from("classes")
    .select("id", { count: "exact", head: true })
    .eq("institution_id", institutionId);
  if (error) throw error;
  return count ?? 0;
}

export async function archiveInstitution(
  supabase: SupabaseClient,
  institutionId: string
): Promise<void> {
  const { error } = await supabase
    .from("institutions")
    .update({ status: "archived" })
    .eq("id", institutionId);
  if (error) throw error;
}

export async function restoreInstitution(
  supabase: SupabaseClient,
  institutionId: string
): Promise<void> {
  const { error } = await supabase
    .from("institutions")
    .update({ status: "active" })
    .eq("id", institutionId);
  if (error) throw error;
}

export async function updateInstitutionPreferredLanguage(
  supabase: SupabaseClient,
  institutionId: string,
  preferredLanguage: string
): Promise<void> {
  const { error } = await supabase
    .from("institutions")
    .update({ preferred_language: preferredLanguage })
    .eq("id", institutionId);
  if (error) throw error;
}

/**
 * Hard-delete an institution. Relies on existing cascades
 * (`ai_institution_settings`, `institution_admin_invites`,
 * `institution_members`, `class_institution_moves`) — callers must ensure
 * no classes reference this institution first (see
 * `countClassesByInstitution`), since `classes.institution_id` has no
 * cascade and will raise an FK violation otherwise.
 */
export async function deleteInstitution(
  supabase: SupabaseClient,
  institutionId: string
): Promise<void> {
  const { error } = await supabase
    .from("institutions")
    .delete()
    .eq("id", institutionId);
  if (error) throw error;
}

export async function listClassesInInstitution(
  supabase: SupabaseClient,
  institutionId: string
): Promise<Class[]> {
  const { data, error } = await supabase
    .from("classes")
    .select(CLASS_COLUMNS)
    .eq("institution_id", institutionId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Class[];
}

/**
 * Count active classes per institution. Used by the institution card grid.
 * One round-trip; group on the client.
 */
export async function countActiveClassesByInstitution(
  supabase: SupabaseClient
): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from("classes")
    .select("institution_id")
    .eq("status", "active");
  if (error) throw error;
  const out = new Map<string, number>();
  for (const row of (data ?? []) as { institution_id: string | null }[]) {
    if (!row.institution_id) continue;
    out.set(row.institution_id, (out.get(row.institution_id) ?? 0) + 1);
  }
  return out;
}

/**
 * Add an institution admin by email.
 *
 * Looks up the user via the SECURITY DEFINER `find_user_id_by_email` RPC
 * (super-admin gated server-side), then inserts an `admin` row in
 * `institution_members`. Throws when the email does not resolve to an
 * existing auth user.
 */
export async function addInstitutionAdminByEmail(
  supabase: SupabaseClient,
  institutionId: string,
  email: string
): Promise<void> {
  const { data: userId, error: lookupError } = await supabase.rpc(
    "find_user_id_by_email",
    { p_email: email }
  );
  if (lookupError) throw lookupError;
  if (!userId) {
    throw new Error(`No user found with email ${email}`);
  }

  const { error: insertError } = await supabase
    .from("institution_members")
    .insert({
      institution_id: institutionId,
      user_id: userId as string,
      role: "admin",
    });
  if (insertError) throw insertError;
}

export async function removeInstitutionAdmin(
  supabase: SupabaseClient,
  institutionId: string,
  userId: string
): Promise<void> {
  const { error } = await supabase
    .from("institution_members")
    .delete()
    .eq("institution_id", institutionId)
    .eq("user_id", userId);
  if (error) throw error;
}

/**
 * Resolve auth.users id -> email for a batch of ids via the SECURITY DEFINER
 * `get_users_by_ids` RPC. Returns a Map keyed by user id.
 */
export async function getUserEmailsByIds(
  supabase: SupabaseClient,
  ids: string[]
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase.rpc("get_users_by_ids", {
    p_ids: ids,
  });
  if (error) throw error;
  const out = new Map<string, string>();
  for (const row of (data ?? []) as { id: string; email: string }[]) {
    out.set(row.id, row.email);
  }
  return out;
}

/**
 * Resolve emails for the current admins of a single institution. Unlike
 * `getUserEmailsByIds` (super-admin-only), this RPC is also callable by an
 * institution admin of the same institution and only returns members of
 * that institution — no arbitrary user resolution.
 */
export async function getInstitutionMemberEmails(
  supabase: SupabaseClient,
  institutionId: string
): Promise<Map<string, string>> {
  const { data, error } = await supabase.rpc(
    "get_institution_member_emails",
    { p_institution_id: institutionId }
  );
  if (error) throw error;
  const out = new Map<string, string>();
  for (const row of (data ?? []) as { id: string; email: string }[]) {
    out.set(row.id, row.email);
  }
  return out;
}

export async function listClassMoves(
  supabase: SupabaseClient,
  options: { classDbId?: string; institutionId?: string; limit?: number } = {}
): Promise<ClassInstitutionMove[]> {
  let query = supabase
    .from("class_institution_moves")
    .select(MOVE_COLUMNS)
    .order("created_at", { ascending: false });

  if (options.classDbId) {
    query = query.eq("class_id", options.classDbId);
  }
  if (options.institutionId) {
    query = query.or(
      `from_institution_id.eq.${options.institutionId},to_institution_id.eq.${options.institutionId}`
    );
  }
  if (options.limit && options.limit > 0) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as ClassInstitutionMove[];
}
