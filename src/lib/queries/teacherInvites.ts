import { createClient } from "@/lib/supabase";

export interface ClassTeacherInvite {
  id: string;
  class_id: string;
  created_by: string;
  expires_at: string;
  revoked_at: string | null;
  max_uses: number | null;
  uses: number;
  created_at: string;
  updated_at: string;
  token: string | null; // Token is only visible to the owner
}

export async function createTeacherInvite(params: {
  classDbId: string;
  expiresAtIso?: string;
}): Promise<string> {
  const supabase = createClient();

  const args: Record<string, unknown> = {
    p_class_id: params.classDbId,
    // unlimited uses
    p_max_uses: null,
  };
  if (params.expiresAtIso) {
    args.p_expires_at = params.expiresAtIso;
  }

  const { data, error } = await supabase.rpc("create_teacher_invite", args);

  if (error) throw error;
  return data as string;
}

export async function revokeTeacherInvite(inviteId: string): Promise<void> {
  const supabase = createClient();

  const { error } = await supabase.rpc("revoke_teacher_invite", {
    p_invite_id: inviteId,
  });

  if (error) throw error;
}

export async function listTeacherInvites(classDbId: string): Promise<ClassTeacherInvite[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("class_teacher_invites")
    .select("*")
    .eq("class_id", classDbId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data || []) as ClassTeacherInvite[];
}

export async function acceptTeacherInvite(token: string): Promise<string> {
  const supabase = createClient();

  const { data, error } = await supabase.rpc("accept_teacher_invite", {
    p_token: token,
  });

  if (error) throw error;
  return data as string; // classes.class_id (public id)
}



