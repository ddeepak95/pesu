import { createClient } from "@/lib/supabase";
import { Class, ProgressViewConfig } from "@/types/class";
import { nanoid } from "nanoid";
import { getProfileFieldsForClass, createProfileField } from "@/lib/queries/profileFields";
import { getContentItemsByClass } from "@/lib/queries/contentItems";
import { getClassGroups, reconfigureClassGroups } from "@/lib/queries/groups";
import { duplicateContentItems } from "@/lib/queries/duplicateContent";
import type { ContentItem } from "@/types/contentItem";

/**
 * Generate a unique short class ID
 */
function generateClassId(): string {
  return nanoid(8); // 8 characters: e.g., "x7k9m2pq"
}

/**
 * Get all classes for a specific user (created by them or co-teaching)
 * Only returns active classes (excludes deleted ones)
 */
export async function getClassesByUser(userId: string): Promise<Class[]> {
  const supabase = createClient();

  console.log("Fetching classes for user:", userId);

  const CLASS_COLUMNS =
    "id, name, class_id, created_by, created_at, updated_at, status, preferred_language, language_config, group_count, enable_progressive_unlock, student_assignment_strategy, progress_view_config, institution_id";

  const { data: teachRows, error: teachError } = await supabase
    .from("class_teachers")
    .select("class_id")
    .eq("teacher_id", userId);

  if (teachError) {
    console.error("Error fetching class_teachers rows:", teachError);
    throw teachError;
  }

  const classDbIds = Array.from(
    new Set((teachRows || []).map((r) => (r as { class_id: string }).class_id))
  ).filter(Boolean);

  if (classDbIds.length === 0) {
    console.log("Classes on roster: 0");
    return [];
  }

  const { data: classes, error: classesError } = await supabase
    .from("classes")
    .select(CLASS_COLUMNS)
    .in("id", classDbIds)
    .eq("status", "active");

  if (classesError) {
    console.error("Error fetching classes for teacher:", classesError);
    throw classesError;
  }

  const merged = ((classes || []) as Class[]).sort((a, b) =>
    b.created_at.localeCompare(a.created_at)
  );

  console.log("Classes fetched successfully:", merged);
  return merged;
}

/**
 * Get all archived classes for a specific user (created by them or co-teaching).
 * Mirrors getClassesByUser but filters to status = 'archived'.
 */
export async function getArchivedClassesByUser(userId: string): Promise<Class[]> {
  const supabase = createClient();

  const CLASS_COLUMNS =
    "id, name, class_id, created_by, created_at, updated_at, status, preferred_language, language_config, group_count, enable_progressive_unlock, student_assignment_strategy, progress_view_config, institution_id";

  const { data: teachRows, error: teachError } = await supabase
    .from("class_teachers")
    .select("class_id")
    .eq("teacher_id", userId);

  if (teachError) {
    console.error("Error fetching class_teachers rows:", teachError);
    throw teachError;
  }

  const classDbIds = Array.from(
    new Set((teachRows || []).map((r) => (r as { class_id: string }).class_id))
  ).filter(Boolean);

  if (classDbIds.length === 0) {
    return [];
  }

  const { data: classes, error: classesError } = await supabase
    .from("classes")
    .select(CLASS_COLUMNS)
    .in("id", classDbIds)
    .eq("status", "archived");

  if (classesError) {
    console.error("Error fetching archived classes for teacher:", classesError);
    throw classesError;
  }

  return ((classes || []) as Class[]).sort((a, b) =>
    b.created_at.localeCompare(a.created_at)
  );
}

/**
 * Create a new class
 */
export async function createClass(
  name: string,
  userId: string,
  preferredLanguage: string = "en",
  institutionId: string | null = null
): Promise<Class> {
  const supabase = createClient();
  const classId = generateClassId();

  const { data, error } = await supabase
    .from("classes")
    .insert({
      name,
      class_id: classId,
      created_by: userId,
      status: "active",
      preferred_language: preferredLanguage,
      ...(institutionId ? { institution_id: institutionId } : {}),
    })
    .select()
    .single();

  if (error) {
    console.error("Error creating class:", error);
    throw error;
  }

  return data;
}

/**
 * Update a class name and/or preferred language
 * @deprecated Use the overload that accepts an updates object instead
 */
export async function updateClass(
  classId: string,
  name: string,
  userId: string,
  preferredLanguage?: string
): Promise<Class>;

/**
 * Update class properties
 */
export async function updateClass(
  classId: string,
  updates: Partial<Pick<Class, "name" | "preferred_language" | "language_config" | "enable_progressive_unlock" | "student_assignment_strategy">>
): Promise<Class>;

export async function updateClass(
  classId: string,
  nameOrUpdates: string | Partial<Pick<Class, "name" | "preferred_language" | "language_config" | "enable_progressive_unlock" | "student_assignment_strategy">>,
  userId?: string,
  preferredLanguage?: string
): Promise<Class> {
  const supabase = createClient();

  let updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  // Handle both old and new function signatures
  if (typeof nameOrUpdates === "string") {
    // Old signature: updateClass(classId, name, userId, preferredLanguage?)
    updateData.name = nameOrUpdates;
    if (preferredLanguage !== undefined) {
      updateData.preferred_language = preferredLanguage;
    }

    // Authorization is enforced by RLS (phase-D: owners, institution admins,
    // and super admins). The `userId` parameter is retained for call-site
    // compatibility and may be used for audit fields if needed.
    void userId;
    const { data, error } = await supabase
      .from("classes")
      .update(updateData)
      .eq("id", classId)
      .select()
      .single();

    if (error) {
      console.error("Error updating class:", error);
      throw error;
    }

    return data;
  } else {
    // New signature: updateClass(classId, updates)
    updateData = { ...updateData, ...nameOrUpdates };

    const { data, error } = await supabase
      .from("classes")
      .update(updateData)
      .eq("id", classId)
      .select()
      .single();

    if (error) {
      console.error("Error updating class:", error);
      throw error;
    }

    return data;
  }
}

/**
 * Soft delete a class (sets status to 'deleted' instead of removing from database).
 *
 * Authorization is delegated to RLS (phase-D policies allow class owners,
 * institution admins for the class's institution, and platform super
 * admins). The `userId` parameter is retained for call-site compatibility.
 */
export async function deleteClass(
  classId: string,
  userId: string
): Promise<void> {
  const supabase = createClient();
  void userId;

  const { error } = await supabase
    .from("classes")
    .update({
      status: "deleted",
      updated_at: new Date().toISOString(),
    })
    .eq("id", classId);

  if (error) {
    console.error("Error deleting class:", error);
    throw error;
  }
}

/**
 * Archive a class (sets status to 'archived'). Hides it from the main teacher
 * and student listings while keeping it fully recoverable via restoreClass.
 *
 * Authorization is delegated to RLS plus the `guard_classes_immutable_and_delete`
 * trigger, which (as of the archived-status migration) requires full class
 * control, institution admin, or platform super admin to archive. The `userId`
 * parameter is retained for call-site compatibility.
 */
export async function archiveClass(
  classId: string,
  userId: string
): Promise<void> {
  const supabase = createClient();
  void userId;

  const { error } = await supabase
    .from("classes")
    .update({
      status: "archived",
      updated_at: new Date().toISOString(),
    })
    .eq("id", classId);

  if (error) {
    console.error("Error archiving class:", error);
    throw error;
  }
}

/**
 * Restore an archived class back to 'active', returning it to the main
 * teacher and student listings.
 */
export async function restoreClass(
  classId: string,
  userId: string
): Promise<void> {
  const supabase = createClient();
  void userId;

  const { error } = await supabase
    .from("classes")
    .update({
      status: "active",
      updated_at: new Date().toISOString(),
    })
    .eq("id", classId);

  if (error) {
    console.error("Error restoring class:", error);
    throw error;
  }
}

/**
 * Get a single class by its unique class_id
 * Only returns active classes (excludes deleted ones)
 */
export async function getClassByClassId(classId: string): Promise<Class | null> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("classes")
    .select("id, name, class_id, created_by, created_at, updated_at, status, preferred_language, language_config, group_count, enable_progressive_unlock, student_assignment_strategy, progress_view_config, institution_id")
    .eq("class_id", classId)
    .eq("status", "active")
    .single();

  if (error) {
    // Log full error details for debugging
    console.error("Error fetching class:", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
      classId,
    });
    return null;
  }

  return data;
}

/**
 * Get all classes for a specific student (enrolled in)
 * Only returns active classes (excludes deleted ones)
 */
export async function getClassesByStudent(studentId: string): Promise<Class[]> {
  const supabase = createClient();

  console.log("Fetching classes for student:", studentId);

  // Get class IDs from class_students table
  const { data: studentRows, error: studentError } = await supabase
    .from("class_students")
    .select("class_id")
    .eq("student_id", studentId)
    .eq("status", "active");

  if (studentError) {
    console.error("Error fetching class_students rows:", studentError);
    throw studentError;
  }

  const classDbIds = Array.from(
    new Set((studentRows || []).map((r) => (r as { class_id: string }).class_id))
  ).filter(Boolean);

  if (classDbIds.length === 0) {
    return [];
  }

  // Fetch the actual class data
  const { data: classes, error: classesError } = await supabase
    .from("classes")
    .select("id, name, class_id, created_by, created_at, updated_at, status, preferred_language, language_config, group_count, enable_progressive_unlock, student_assignment_strategy, progress_view_config, institution_id")
    .in("id", classDbIds)
    .eq("status", "active");

  if (classesError) {
    console.error("Error fetching student classes:", classesError);
    throw classesError;
  }

  const result = (classes || []) as Class[];
  const sorted = result.sort((a, b) => b.created_at.localeCompare(a.created_at));

  console.log("Student classes fetched successfully:", sorted);
  return sorted;
}

/**
 * Get the progress view configuration for a class.
 * Returns null gracefully if the column doesn't exist yet (migration not run).
 */
export async function getProgressViewConfig(
  classDbId: string
): Promise<ProgressViewConfig | null> {
  const supabase = createClient();

  try {
    const { data, error } = await supabase
      .from("classes")
      .select("progress_view_config")
      .eq("id", classDbId)
      .single();

    if (error) {
      // Column may not exist yet if migration hasn't been run
      console.warn("Could not fetch progress view config (column may not exist yet):", error.message || error);
      return null;
    }

    return (data?.progress_view_config as ProgressViewConfig) ?? null;
  } catch {
    // Gracefully handle if column doesn't exist
    return null;
  }
}

/**
 * Save the progress view configuration for a class (shared across all co-teachers).
 * Silently fails if the column doesn't exist yet (migration not run).
 */
export async function saveProgressViewConfig(
  classDbId: string,
  config: ProgressViewConfig
): Promise<void> {
  const supabase = createClient();

  try {
    const { error } = await supabase
      .from("classes")
      .update({
        progress_view_config: config,
        updated_at: new Date().toISOString(),
      })
      .eq("id", classDbId);

    if (error) {
      console.warn("Could not save progress view config (column may not exist yet):", error.message || error);
    }
  } catch {
    // Silently handle if column doesn't exist
  }
}

const CLASS_COLUMNS_FULL =
  "id, name, class_id, created_by, created_at, updated_at, status, preferred_language, language_config, group_count, enable_progressive_unlock, student_assignment_strategy, progress_view_config, institution_id";

/**
 * Duplicate a class with all settings, profile fields, groups, and content.
 * The new class is owned by userId (must be the source class owner).
 * Returns the new class for redirect. Does not copy students, co-teachers, or invites.
 */
export async function duplicateClass(
  sourceClassDbId: string,
  userId: string
): Promise<Class> {
  const supabase = createClient();

  const { data: sourceClass, error: fetchError } = await supabase
    .from("classes")
    .select(CLASS_COLUMNS_FULL)
    .eq("id", sourceClassDbId)
    .eq("status", "active")
    .single();

  if (fetchError || !sourceClass) {
    console.error("Error fetching source class:", fetchError);
    throw new Error("Class not found or access denied");
  }

  const source = sourceClass as Class;
  // Authorization is delegated to RLS for both the source SELECT (above) and
  // the insert below. The new class is created with `created_by = userId`,
  // so the caller becomes the owner of the duplicate regardless of whether
  // they owned the source (institution and super admins are explicitly
  // allowed to duplicate a class on behalf of an institution).

  const newClassId = generateClassId();
  const insertPayload = {
    name: "Copy of " + source.name,
    class_id: newClassId,
    created_by: userId,
    status: "active" as const,
    preferred_language: source.preferred_language ?? "en",
    language_config: source.language_config ?? null,
    group_count: source.group_count ?? 1,
    enable_progressive_unlock: source.enable_progressive_unlock ?? false,
    student_assignment_strategy: source.student_assignment_strategy ?? "round_robin",
    progress_view_config: source.progress_view_config ?? null,
    institution_id: source.institution_id,
  };

  const { data: newClass, error: insertError } = await supabase
    .from("classes")
    .insert(insertPayload)
    .select(CLASS_COLUMNS_FULL)
    .single();

  if (insertError || !newClass) {
    console.error("Error creating duplicated class:", insertError);
    throw insertError ?? new Error("Failed to create class");
  }

  const newClassRow = newClass as Class;

  const profileFields = await getProfileFieldsForClass(sourceClassDbId);
  for (const field of profileFields) {
    await createProfileField(newClassRow.id, {
      field_name: field.field_name,
      field_type: field.field_type,
      options: field.field_type === "dropdown" ? field.options ?? [] : undefined,
      position: field.position,
      is_mandatory: field.is_mandatory,
      is_display_name: field.is_display_name,
    });
  }

  let newGroups = await getClassGroups(newClassRow.id);
  if (newGroups.length === 0 && (source.group_count ?? 1) > 0) {
    await reconfigureClassGroups({
      classDbId: newClassRow.id,
      newGroupCount: source.group_count ?? 1,
    });
    newGroups = await getClassGroups(newClassRow.id);
  }

  const sourceGroups = await getClassGroups(sourceClassDbId);
  const sourceGroupIdToIndex = new Map<string, number>();
  sourceGroups.forEach((g, i) => sourceGroupIdToIndex.set(g.id, i));
  const destGroupIdByIndex = new Map<number, string>();
  newGroups.forEach((g, i) => destGroupIdByIndex.set(i, g.id));

  const contentItems = await getContentItemsByClass(sourceClassDbId);
  const itemsByDestGroup = new Map<string | null, ContentItem[]>();
  for (const item of contentItems) {
    const destGroupId: string | null =
      item.class_group_id == null
        ? null
        : destGroupIdByIndex.get(sourceGroupIdToIndex.get(item.class_group_id) ?? -1) ?? null;
    const key = destGroupId ?? "__class_level__";
    if (!itemsByDestGroup.has(key)) itemsByDestGroup.set(key, []);
    itemsByDestGroup.get(key)!.push(item);
  }

  for (const [key, items] of itemsByDestGroup) {
    const destinationClassGroupId = key === "__class_level__" ? null : key;
    const sorted = [...items].sort((a, b) => a.position - b.position);
    await duplicateContentItems({
      items: sorted,
      destinationClassDbId: newClassRow.id,
      destinationClassGroupId,
      userId,
    });
  }

  return newClassRow;
}

/**
 * Super-admin only: move a class into a different institution.
 *
 * Calls the SECURITY DEFINER RPC `public.move_class_to_institution`, which
 * verifies the caller is in `public.platform_super_admins`, updates
 * `classes.institution_id`, and writes a row to `class_institution_moves`.
 *
 * Returns the audit row id, or null if the class was already under the
 * target institution (treated as a no-op so callers can retry safely).
 */
export async function moveClassToInstitution(
  classDbId: string,
  targetInstitutionId: string,
  reason?: string
): Promise<string | null> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("move_class_to_institution", {
    p_class_id: classDbId,
    p_target_institution_id: targetInstitutionId,
    p_reason: reason ?? null,
  });

  if (error) {
    console.error("Error moving class to institution:", error);
    throw error;
  }

  return (data as string | null) ?? null;
}

