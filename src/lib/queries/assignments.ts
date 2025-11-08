import { createClient } from "@/lib/supabase";
import { Assignment } from "@/types/assignment";
import { nanoid } from "nanoid";

/**
 * Generate a unique short assignment ID
 */
function generateAssignmentId(): string {
  return nanoid(8); // 8 characters: e.g., "x7k9m2pq"
}

/**
 * Get all assignments for a specific class
 * Only returns active assignments (excludes deleted ones)
 */
export async function getAssignmentsByClass(classId: string): Promise<Assignment[]> {
  const supabase = createClient();

  console.log("Fetching assignments for class:", classId);

  const { data, error } = await supabase
    .from("assignments")
    .select("*")
    .eq("class_id", classId)
    .eq("status", "active") // Only fetch active assignments
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching assignments:", error);
    console.error("Error details:", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });
    throw error;
  }

  console.log("Assignments fetched successfully:", data);
  return data || [];
}

/**
 * Get a single assignment by its unique assignment_id
 * Only returns active assignments (excludes deleted ones)
 */
export async function getAssignmentById(assignmentId: string): Promise<Assignment | null> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("assignments")
    .select("*")
    .eq("assignment_id", assignmentId)
    .eq("status", "active")
    .single();

  if (error) {
    // When RLS blocks access, Supabase returns PGRST116 (not found) because
    // from the user's perspective, a blocked row doesn't exist.
    // We can't distinguish between "truly not found" and "blocked by RLS"
    // so we return null and let the frontend handle the message.
    return null;
  }

  return data;
}

/**
 * Create a new assignment
 * Authorization is handled by RLS policies - allows class owner and co-teachers
 */
export async function createAssignment(
  assignment: {
    class_id: string;
    title: string;
    questions: {
      order: number;
      prompt: string;
      total_points: number;
      rubric: { item: string; points: number }[];
      supporting_content: string;
    }[];
    total_points: number;
    preferred_language: string;
    is_public?: boolean;
  },
  userId: string
): Promise<Assignment> {
  const supabase = createClient();
  const assignmentId = generateAssignmentId();

  const { data, error } = await supabase
    .from("assignments")
    .insert({
      assignment_id: assignmentId,
      class_id: assignment.class_id,
      title: assignment.title,
      questions: assignment.questions,
      total_points: assignment.total_points,
      created_by: userId,
      status: "active",
      preferred_language: assignment.preferred_language,
      is_public: assignment.is_public ?? false,
    })
    .select()
    .single();

  if (error) {
    console.error("Error creating assignment:", error);
    throw error;
  }

  return data;
}

/**
 * Update an assignment
 * Authorization is handled by RLS policies - allows class owner and co-teachers
 */
export async function updateAssignment(
  assignmentId: string,
  assignment: {
    title: string;
    questions: {
      order: number;
      prompt: string;
      total_points: number;
      rubric: { item: string; points: number }[];
      supporting_content: string;
    }[];
    total_points: number;
    preferred_language: string;
    is_public?: boolean;
  }
): Promise<Assignment> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("assignments")
    .update({
      title: assignment.title,
      questions: assignment.questions,
      total_points: assignment.total_points,
      preferred_language: assignment.preferred_language,
      is_public: assignment.is_public ?? false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", assignmentId)
    .select()
    .single();

  if (error) {
    console.error("Error updating assignment:", error);
    throw error;
  }

  return data;
}

/**
 * Soft delete an assignment (sets status to 'deleted' instead of removing from database)
 * Authorization is handled by RLS policies - allows class owner and co-teachers
 */
export async function deleteAssignment(assignmentId: string): Promise<void> {
  const supabase = createClient();

  const { error } = await supabase
    .from("assignments")
    .update({
      status: "deleted",
      updated_at: new Date().toISOString(),
    })
    .eq("id", assignmentId);

  if (error) {
    console.error("Error deleting assignment:", error);
    throw error;
  }
}

