import { createClient } from "@/lib/supabase";
import { Assignment, ResponderFieldConfig, BotPromptConfig } from "@/types/assignment";
import { nanoid } from "nanoid";
import { softDeleteContentItemByRef } from "./contentItems";

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
 * Get all assignments for a class (teacher view).
 * Returns both active and draft assignments (excludes deleted).
 */
export async function getAssignmentsByClassForTeacher(
  classId: string
): Promise<Assignment[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("assignments")
    .select("*")
    .eq("class_id", classId)
    .in("status", ["active", "draft"])
    .order("created_at", { ascending: false });

  if (error) throw error;
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
 * Get a single assignment by its unique assignment_id (teacher view).
 * Returns both active and draft assignments (excludes deleted).
 */
export async function getAssignmentByIdForTeacher(
  assignmentId: string
): Promise<Assignment | null> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("assignments")
    .select("*")
    .eq("assignment_id", assignmentId)
    .in("status", ["active", "draft"])
    .single();

  if (error) return null;
  return data as Assignment;
}

/**
 * Get assignments by their database UUID primary keys.
 */
export async function getAssignmentsByIds(ids: string[]): Promise<Assignment[]> {
  const supabase = createClient();

  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from("assignments")
    .select("*")
    .in("id", ids)
    .eq("status", "active");

  if (error) {
    throw error;
  }

  return data || [];
}

/**
 * Get assignments by their database UUID primary keys (teacher view).
 * Returns both active and draft assignments (excludes deleted).
 */
export async function getAssignmentsByIdsForTeacher(ids: string[]): Promise<Assignment[]> {
  const supabase = createClient();
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from("assignments")
    .select("*")
    .in("id", ids)
    .in("status", ["active", "draft"]);

  if (error) throw error;
  return data || [];
}

/**
 * Create a new assignment
 * Authorization is handled by RLS policies - allows class owner and co-teachers
 */
export async function createAssignment(
  assignment: {
    class_id: string;
    class_group_id?: string | null;
    title: string;
    questions: {
      order: number;
      prompt: string;
      total_points: number;
      rubric: { item: string; points: number }[];
      supporting_content: string;
      expected_answer?: string;
    }[];
    total_points: number;
    preferred_language: string;
    lock_language?: boolean;
    is_public?: boolean;
    assessment_mode?: "voice" | "text_chat" | "static_text";
    status?: "draft" | "active";
    responder_fields_config?: ResponderFieldConfig[]; // JSONB array of ResponderFieldConfig
    max_attempts?: number;
    bot_prompt_config?: BotPromptConfig; // AI bot configuration for voice/chat modes
    student_instructions?: string; // Display-only instructions for students
    show_rubric?: boolean; // Whether to show rubric to students
    show_rubric_points?: boolean; // Whether to show rubric points to students
    use_star_display?: boolean; // Whether to show stars instead of points to students
    star_scale?: number; // Number of stars in the rating scale
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
      class_group_id: assignment.class_group_id ?? null,
      title: assignment.title,
      questions: assignment.questions,
      total_points: assignment.total_points,
      created_by: userId,
      status: assignment.status ?? "active",
      preferred_language: assignment.preferred_language,
      lock_language: assignment.lock_language ?? false,
      is_public: assignment.is_public ?? false,
      assessment_mode: assignment.assessment_mode ?? "voice",
      responder_fields_config: assignment.responder_fields_config ?? null,
      max_attempts: assignment.max_attempts ?? 1,
      bot_prompt_config: assignment.bot_prompt_config ?? null,
      student_instructions: assignment.student_instructions ?? null,
      show_rubric: assignment.show_rubric ?? true,
      show_rubric_points: assignment.show_rubric_points ?? true,
      use_star_display: assignment.use_star_display ?? false,
      star_scale: assignment.star_scale ?? 5,
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
      expected_answer?: string;
    }[];
    total_points: number;
    preferred_language: string;
    lock_language?: boolean;
    is_public?: boolean;
    assessment_mode?: "voice" | "text_chat" | "static_text";
    responder_fields_config?: ResponderFieldConfig[]; // JSONB array of ResponderFieldConfig
    max_attempts?: number;
    bot_prompt_config?: BotPromptConfig; // AI bot configuration for voice/chat modes
    student_instructions?: string; // Display-only instructions for students
    show_rubric?: boolean; // Whether to show rubric to students
    show_rubric_points?: boolean; // Whether to show rubric points to students
    use_star_display?: boolean; // Whether to show stars instead of points to students
    star_scale?: number; // Number of stars in the rating scale
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
      lock_language: assignment.lock_language ?? false,
      is_public: assignment.is_public ?? false,
      assessment_mode: assignment.assessment_mode ?? "voice",
      responder_fields_config: assignment.responder_fields_config ?? null,
      max_attempts: assignment.max_attempts ?? 1,
      bot_prompt_config: assignment.bot_prompt_config ?? null,
      student_instructions: assignment.student_instructions ?? null,
      show_rubric: assignment.show_rubric ?? true,
      show_rubric_points: assignment.show_rubric_points ?? true,
      use_star_display: assignment.use_star_display ?? false,
      star_scale: assignment.star_scale ?? 5,
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
 * Also deletes the associated content_item
 * Authorization is handled by RLS policies - allows class owner and co-teachers
 */
export async function deleteAssignment(assignmentId: string, classId: string): Promise<void> {
  const supabase = createClient();

  // Delete the assignment
  const { error } = await supabase
    .from("assignments")
    .update({ status: "deleted", updated_at: new Date().toISOString() })
    .eq("id", assignmentId);

  if (error) {
    console.error("Error deleting assignment:", {
      error,
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
      assignmentId,
    });
    
    // Provide more helpful error messages based on error codes
    if (error.code === "42501" || error.code === "PGRST301") {
      throw new Error("You don't have permission to delete this assignment. Only the class owner or co-teachers can delete assignments.");
    } else if (error.code === "PGRST116") {
      throw new Error("Assignment not found. It may have already been deleted.");
    } else {
      throw new Error(`Failed to delete assignment: ${error.message || error.code || "Unknown error"}`);
    }
  }

  // Also delete the associated content_item
  try {
    await softDeleteContentItemByRef({
      class_id: classId,
      type: "formative_assignment",
      ref_id: assignmentId,
    });
  } catch (contentItemError) {
    console.error("Error deleting content item for assignment:", contentItemError);
    // Don't throw - the assignment is already deleted, content item deletion is secondary
  }
}

