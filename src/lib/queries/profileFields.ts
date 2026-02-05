import { createClient } from "@/lib/supabase";
import {
  ProfileField,
  ProfileFieldInput,
  StudentProfile,
} from "@/types/profileFields";

/**
 * Get all profile fields for a class (ordered by position)
 */
export async function getProfileFieldsForClass(
  classDbId: string
): Promise<ProfileField[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("class_mandatory_fields")
    .select("*")
    .eq("class_id", classDbId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data || []) as ProfileField[];
}

/**
 * Create a new profile field for a class
 */
export async function createProfileField(
  classDbId: string,
  field: ProfileFieldInput
): Promise<ProfileField> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("class_mandatory_fields")
    .insert({
      class_id: classDbId,
      field_name: field.field_name,
      field_type: field.field_type,
      options: field.field_type === "dropdown" ? field.options || [] : null,
      position: field.position,
      is_mandatory: field.is_mandatory,
      is_display_name: field.is_display_name,
    })
    .select()
    .single();

  if (error) throw error;
  return data as ProfileField;
}

/**
 * Update an existing profile field
 */
export async function updateProfileField(
  fieldId: string,
  updates: Partial<ProfileFieldInput>
): Promise<ProfileField> {
  const supabase = createClient();

  const updateData: Record<string, unknown> = {};
  if (updates.field_name !== undefined) updateData.field_name = updates.field_name;
  if (updates.field_type !== undefined) updateData.field_type = updates.field_type;
  if (updates.options !== undefined) updateData.options = updates.options;
  if (updates.position !== undefined) updateData.position = updates.position;
  if (updates.is_mandatory !== undefined) updateData.is_mandatory = updates.is_mandatory;
  if (updates.is_display_name !== undefined) updateData.is_display_name = updates.is_display_name;

  const { data, error } = await supabase
    .from("class_mandatory_fields")
    .update(updateData)
    .eq("id", fieldId)
    .select()
    .single();

  if (error) throw error;
  return data as ProfileField;
}

/**
 * Delete a profile field
 */
export async function deleteProfileField(fieldId: string): Promise<void> {
  const supabase = createClient();

  const { error } = await supabase
    .from("class_mandatory_fields")
    .delete()
    .eq("id", fieldId);

  if (error) throw error;
}

/**
 * Batch update field positions (for reordering)
 */
export async function updateProfileFieldPositions(
  fields: { id: string; position: number }[]
): Promise<void> {
  const supabase = createClient();

  for (const field of fields) {
    const { error } = await supabase
      .from("class_mandatory_fields")
      .update({ position: field.position })
      .eq("id", field.id);

    if (error) throw error;
  }
}

/**
 * Get a student's profile for a class
 */
export async function getStudentProfile(
  classDbId: string,
  studentId: string
): Promise<StudentProfile | null> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("student_class_info")
    .select("*")
    .eq("class_id", classDbId)
    .eq("student_id", studentId)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return null;
    }
    throw error;
  }

  return data as StudentProfile;
}

/**
 * Save or update a student's profile for a class
 */
export async function upsertStudentProfile(
  classDbId: string,
  studentId: string,
  fieldResponses: Record<string, string>
): Promise<StudentProfile> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("student_class_info")
    .upsert(
      {
        class_id: classDbId,
        student_id: studentId,
        field_responses: fieldResponses,
      },
      {
        onConflict: "class_id,student_id",
      }
    )
    .select()
    .single();

  if (error) throw error;
  return data as StudentProfile;
}

/**
 * Get all student profiles for a class (teacher view)
 */
export async function getAllStudentProfiles(
  classDbId: string
): Promise<StudentProfile[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("student_class_info")
    .select("*")
    .eq("class_id", classDbId);

  if (error) throw error;
  return (data || []) as StudentProfile[];
}

/**
 * Check if a student has completed all required profile fields for a class
 */
export async function hasCompletedRequiredProfile(
  classDbId: string,
  studentId: string
): Promise<boolean> {
  const supabase = createClient();

  // Use the database function for accurate checking
  const { data, error } = await supabase.rpc("has_completed_mandatory_info", {
    p_class_id: classDbId,
    p_student_id: studentId,
  });

  if (error) {
    console.warn("has_completed_mandatory_info RPC failed, using fallback:", error);
    return await checkRequiredProfileManually(classDbId, studentId);
  }

  return data as boolean;
}

/**
 * Fallback manual check for required profile completion
 */
async function checkRequiredProfileManually(
  classDbId: string,
  studentId: string
): Promise<boolean> {
  const fields = await getProfileFieldsForClass(classDbId);

  // Only check mandatory fields
  const mandatoryFields = fields.filter((f) => f.is_mandatory);

  if (mandatoryFields.length === 0) {
    return true;
  }

  const studentProfile = await getStudentProfile(classDbId, studentId);

  if (!studentProfile) {
    return false;
  }

  const responses = studentProfile.field_responses;
  for (const field of mandatoryFields) {
    const response = responses[field.id];
    if (!response || response.trim() === "") {
      return false;
    }
  }

  return true;
}
