"use server";

import "server-only";

import { revalidatePath } from "next/cache";

import { verifySession } from "@/lib/dal";
import {
  clearSettingValue,
  listSettingRowsForScope,
  setSettingLock,
  upsertSettingValue,
} from "@/lib/queries/settings";
import {
  assertCanToggleLock,
  assertCanWriteClassOverride,
  assertCanWriteInstitutionValue,
} from "./enforce";
import {
  getSettingDefinition,
  isKnownSettingKey,
  type SettingKey,
} from "./registry";
import {
  mergeInstitutionSetting,
  type SettingRow,
} from "./resolve";
import type { ViewerRole } from "./capabilities";

// ---------------------------------------------------------------------------
// Authorization helpers
// ---------------------------------------------------------------------------

async function resolveViewerForInstitution(
  supabase: Awaited<ReturnType<typeof verifySession>>["supabase"],
  userId: string,
  institutionId: string
): Promise<ViewerRole> {
  const [superRes, memberRes] = await Promise.all([
    supabase
      .from("platform_super_admins")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("institution_members")
      .select("user_id")
      .eq("institution_id", institutionId)
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle(),
  ]);
  if (!superRes.error && superRes.data) return "super_admin";
  if (!memberRes.error && memberRes.data) return "institution_admin";
  return "viewer";
}

interface ClassViewerContext {
  viewerRole: ViewerRole;
  institutionId: string;
}

async function resolveViewerForClass(
  supabase: Awaited<ReturnType<typeof verifySession>>["supabase"],
  userId: string,
  classDbId: string
): Promise<ClassViewerContext> {
  const { data: classRow, error: classErr } = await supabase
    .from("classes")
    .select("id, created_by, institution_id")
    .eq("id", classDbId)
    .maybeSingle();
  if (classErr) throw classErr;
  if (!classRow) {
    throw new Error("Class not found");
  }
  const institutionId = (classRow.institution_id as string | null) ?? "";

  const [superRes, memberRes] = await Promise.all([
    supabase
      .from("platform_super_admins")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle(),
    institutionId
      ? supabase
          .from("institution_members")
          .select("user_id")
          .eq("institution_id", institutionId)
          .eq("user_id", userId)
          .eq("role", "admin")
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (!superRes.error && superRes.data) {
    return { viewerRole: "super_admin", institutionId };
  }
  if (!memberRes.error && memberRes.data) {
    return { viewerRole: "institution_admin", institutionId };
  }
  if (classRow.created_by === userId) {
    return { viewerRole: "class_owner", institutionId };
  }
  return { viewerRole: "viewer", institutionId };
}

async function getInstitutionLocksForKey(
  supabase: Awaited<ReturnType<typeof verifySession>>["supabase"],
  institutionId: string,
  key: SettingKey
) {
  if (!institutionId) {
    return { allowAdminEdit: true, allowChildOverride: true };
  }
  const rows = await listSettingRowsForScope(
    supabase,
    "institution",
    institutionId
  );
  const def = getSettingDefinition(key);
  const row =
    (rows.find((r: SettingRow) => r.key === key) as SettingRow | undefined) ??
    null;
  const merged = mergeInstitutionSetting(def, row);
  return merged.institutionLocks;
}

function revalidateInstitution(institutionId: string) {
  revalidatePath("/platform");
  revalidatePath(`/platform/institutions/${institutionId}`);
  revalidatePath(`/admin/institutions/${institutionId}`);
}

function revalidateClass(classShortId: string | null) {
  if (classShortId) {
    revalidatePath(`/teacher/classes/${classShortId}/settings`);
    revalidatePath(`/teacher/classes/${classShortId}`);
  }
}

// ---------------------------------------------------------------------------
// Action helpers — return a result object so callers can show errors inline
// (server actions called via `useTransition` from client components).
// ---------------------------------------------------------------------------

export interface SettingActionResult {
  ok: boolean;
  error?: string;
}

function ok(): SettingActionResult {
  return { ok: true };
}

function fail(message: string): SettingActionResult {
  return { ok: false, error: message };
}

function asSettingKey(rawKey: string): SettingKey {
  if (!isKnownSettingKey(rawKey)) {
    throw new Error(`Unknown setting key: ${rawKey}`);
  }
  return rawKey;
}

// ---------------------------------------------------------------------------
// Institution-scope actions
// ---------------------------------------------------------------------------

export async function upsertInstitutionSettingAction(input: {
  institutionId: string;
  key: string;
  value: unknown;
}): Promise<SettingActionResult> {
  try {
    const { user, supabase } = await verifySession();
    const key = asSettingKey(input.key);
    const viewerRole = await resolveViewerForInstitution(
      supabase,
      user.id,
      input.institutionId
    );
    const locks = await getInstitutionLocksForKey(
      supabase,
      input.institutionId,
      key
    );
    const validated = assertCanWriteInstitutionValue({
      key,
      rawValue: input.value,
      viewerRole,
      institutionLocks: locks,
    });
    await upsertSettingValue(supabase, {
      scope: "institution",
      scopeId: input.institutionId,
      key,
      value: validated,
      updatedBy: user.id,
    });
    revalidateInstitution(input.institutionId);
    return ok();
  } catch (err) {
    return fail((err as Error).message);
  }
}

export async function setInstitutionSettingLockAction(input: {
  institutionId: string;
  key: string;
  lock: "allow_admin_edit" | "allow_child_override";
  enabled: boolean;
}): Promise<SettingActionResult> {
  try {
    const { user, supabase } = await verifySession();
    const key = asSettingKey(input.key);
    const viewerRole = await resolveViewerForInstitution(
      supabase,
      user.id,
      input.institutionId
    );
    const locks = await getInstitutionLocksForKey(
      supabase,
      input.institutionId,
      key
    );
    assertCanToggleLock({
      key,
      lock: input.lock,
      viewerRole,
      institutionLocks: locks,
    });
    const def = getSettingDefinition(key);
    await setSettingLock(
      supabase,
      {
        scope: "institution",
        scopeId: input.institutionId,
        key,
        lock: input.lock,
        enabled: input.enabled,
        updatedBy: user.id,
      },
      def.default
    );
    revalidateInstitution(input.institutionId);
    return ok();
  } catch (err) {
    return fail((err as Error).message);
  }
}

// ---------------------------------------------------------------------------
// Class-scope actions
// ---------------------------------------------------------------------------

export async function upsertClassSettingOverrideAction(input: {
  classDbId: string;
  classShortId: string | null;
  key: string;
  value: unknown;
}): Promise<SettingActionResult> {
  try {
    const { user, supabase } = await verifySession();
    const key = asSettingKey(input.key);
    const { viewerRole, institutionId } = await resolveViewerForClass(
      supabase,
      user.id,
      input.classDbId
    );
    const locks = await getInstitutionLocksForKey(supabase, institutionId, key);
    const validated = assertCanWriteClassOverride({
      key,
      rawValue: input.value,
      viewerRole,
      institutionLocks: locks,
    });
    await upsertSettingValue(supabase, {
      scope: "class",
      scopeId: input.classDbId,
      key,
      value: validated,
      updatedBy: user.id,
    });
    revalidateClass(input.classShortId);
    return ok();
  } catch (err) {
    return fail((err as Error).message);
  }
}

export async function clearClassSettingOverrideAction(input: {
  classDbId: string;
  classShortId: string | null;
  key: string;
}): Promise<SettingActionResult> {
  try {
    const { user, supabase } = await verifySession();
    const key = asSettingKey(input.key);
    const { viewerRole, institutionId } = await resolveViewerForClass(
      supabase,
      user.id,
      input.classDbId
    );
    const locks = await getInstitutionLocksForKey(supabase, institutionId, key);
    // Clearing an override has the same permission gate as creating one.
    assertCanWriteClassOverride({
      key,
      rawValue: getSettingDefinition(key).default,
      viewerRole,
      institutionLocks: locks,
    });
    await clearSettingValue(supabase, {
      scope: "class",
      scopeId: input.classDbId,
      key,
    });
    revalidateClass(input.classShortId);
    return ok();
  } catch (err) {
    return fail((err as Error).message);
  }
}
