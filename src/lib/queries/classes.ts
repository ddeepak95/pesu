import { createClient } from "@/lib/supabase";
import { Class } from "@/types/class";
import { nanoid } from "nanoid";

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

  // Avoid relying on join/or syntax across embedded relationships.
  // Fetch owned classes + co-taught classes via class_teachers, then merge.

  const ownedQuery = supabase
    .from("classes")
    .select("*")
    .eq("created_by", userId)
    .eq("status", "active");

  const coTeachIdsQuery = supabase
    .from("class_teachers")
    .select("class_id")
    .eq("teacher_id", userId);

  const [{ data: owned, error: ownedError }, { data: teachRows, error: teachError }] =
    await Promise.all([ownedQuery, coTeachIdsQuery]);

  if (ownedError) {
    console.error("Error fetching owned classes:", ownedError);
    throw ownedError;
  }

  let coTaught: Class[] = [];
  if (teachError) {
    // If class_teachers isn't available yet (or RLS blocks it), fall back to owned classes only.
    console.error("Error fetching class_teachers rows:", teachError);
  } else {
    const classDbIds = Array.from(
      new Set((teachRows || []).map((r) => (r as { class_id: string }).class_id))
    ).filter(Boolean);

    if (classDbIds.length > 0) {
      const { data: taught, error: taughtError } = await supabase
        .from("classes")
        .select("*")
        .in("id", classDbIds)
        .eq("status", "active");

      if (taughtError) {
        console.error("Error fetching co-taught classes:", taughtError);
      } else {
        coTaught = (taught || []) as Class[];
      }
    }
  }

  const mergedById = new Map<string, Class>();
  for (const c of (owned || []) as Class[]) mergedById.set(c.id, c);
  for (const c of coTaught) mergedById.set(c.id, c);

  const merged = Array.from(mergedById.values()).sort((a, b) =>
    b.created_at.localeCompare(a.created_at)
  );

  console.log("Classes fetched successfully:", merged);
  return merged;
}

/**
 * Create a new class
 */
export async function createClass(
  name: string,
  userId: string,
  preferredLanguage: string = "en"
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
 */
export async function updateClass(
  classId: string,
  name: string,
  userId: string,
  preferredLanguage?: string
): Promise<Class> {
  const supabase = createClient();

  const updateData: { name: string; updated_at: string; preferred_language?: string } = {
    name,
    updated_at: new Date().toISOString(),
  };

  if (preferredLanguage !== undefined) {
    updateData.preferred_language = preferredLanguage;
  }

  const { data, error } = await supabase
    .from("classes")
    .update(updateData)
    .eq("id", classId)
    .eq("created_by", userId) // Ensure user owns the class
    .select()
    .single();

  if (error) {
    console.error("Error updating class:", error);
    throw error;
  }

  return data;
}

/**
 * Soft delete a class (sets status to 'deleted' instead of removing from database)
 */
export async function deleteClass(
  classId: string,
  userId: string
): Promise<void> {
  const supabase = createClient();

  const { error } = await supabase
    .from("classes")
    .update({ 
      status: "deleted",
      updated_at: new Date().toISOString() 
    })
    .eq("id", classId)
    .eq("created_by", userId); // Ensure user owns the class

  if (error) {
    console.error("Error deleting class:", error);
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
    .select("*")
    .eq("class_id", classId)
    .eq("status", "active")
    .single();

  if (error) {
    console.error("Error fetching class:", error);
    return null;
  }

  return data;
}

