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

  const { data, error } = await supabase
    .from("classes")
    .select("*")
    .eq("created_by", userId)
    .eq("status", "active") // Only fetch active classes
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching classes:", error);
    console.error("Error details:", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });
    throw error;
  }

  console.log("Classes fetched successfully:", data);
  return data || [];
}

/**
 * Create a new class
 */
export async function createClass(
  name: string,
  userId: string
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
 * Update a class name
 */
export async function updateClass(
  classId: string,
  name: string,
  userId: string
): Promise<Class> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("classes")
    .update({ name, updated_at: new Date().toISOString() })
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

