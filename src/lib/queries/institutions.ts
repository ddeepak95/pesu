import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Class } from "@/types/class";

const CLASS_COLUMNS =
  "id, name, class_id, created_by, created_at, updated_at, status, preferred_language, group_count, enable_progressive_unlock, student_assignment_strategy, progress_view_config, institution_id";

export interface Institution {
  id: string;
  name: string;
  slug: string | null;
  status: string;
  is_default: boolean;
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
  "id, name, slug, status, is_default, created_at, updated_at";

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
  input: { name: string; slug?: string | null }
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
  return data as Institution;
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
