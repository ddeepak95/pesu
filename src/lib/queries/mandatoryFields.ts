import { createClient } from "@/lib/supabase";
import {
  MandatoryField,
  MandatoryFieldInput,
  StudentClassInfo,
} from "@/types/mandatoryFields";

/**
 * Get all mandatory fields for a class (ordered by position)
 */
export async function getMandatoryFieldsForClass(
  classDbId: string
): Promise<MandatoryField[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("class_mandatory_fields")
    .select("*")
    .eq("class_id", classDbId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data || []) as MandatoryField[];
}

/**
 * Create a new mandatory field for a class
 */
export async function createMandatoryField(
  classDbId: string,
  field: MandatoryFieldInput
): Promise<MandatoryField> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("class_mandatory_fields")
    .insert({
      class_id: classDbId,
      field_name: field.field_name,
      field_type: field.field_type,
      options: field.field_type === "dropdown" ? field.options || [] : null,
      position: field.position,
    })
    .select()
    .single();

  if (error) throw error;
  return data as MandatoryField;
}

/**
 * Update an existing mandatory field
 */
export async function updateMandatoryField(
  fieldId: string,
  updates: Partial<MandatoryFieldInput>
): Promise<MandatoryField> {
  const supabase = createClient();

  const updateData: Record<string, unknown> = {};
  if (updates.field_name !== undefined) updateData.field_name = updates.field_name;
  if (updates.field_type !== undefined) updateData.field_type = updates.field_type;
  if (updates.options !== undefined) updateData.options = updates.options;
  if (updates.position !== undefined) updateData.position = updates.position;

  const { data, error } = await supabase
    .from("class_mandatory_fields")
    .update(updateData)
    .eq("id", fieldId)
    .select()
    .single();

  if (error) throw error;
  return data as MandatoryField;
}

/**
 * Delete a mandatory field
 */
export async function deleteMandatoryField(fieldId: string): Promise<void> {
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
export async function updateFieldPositions(
  fields: { id: string; position: number }[]
): Promise<void> {
  const supabase = createClient();

  // Update each field's position
  for (const field of fields) {
    const { error } = await supabase
      .from("class_mandatory_fields")
      .update({ position: field.position })
      .eq("id", field.id);

    if (error) throw error;
  }
}

/**
 * Get student's submitted info for a class
 */
export async function getStudentClassInfo(
  classDbId: string,
  studentId: string
): Promise<StudentClassInfo | null> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("student_class_info")
    .select("*")
    .eq("class_id", classDbId)
    .eq("student_id", studentId)
    .single();

  if (error) {
    // If no record found, return null (not an error)
    if (error.code === "PGRST116") {
      return null;
    }
    throw error;
  }

  return data as StudentClassInfo;
}

/**
 * Save or update student's class info
 */
export async function upsertStudentClassInfo(
  classDbId: string,
  studentId: string,
  fieldResponses: Record<string, string>
): Promise<StudentClassInfo> {
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
  return data as StudentClassInfo;
}

/**
 * Check if a student has completed all mandatory info for a class
 */
export async function hasCompletedMandatoryInfo(
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
    // If function doesn't exist, fall back to manual check
    console.warn("has_completed_mandatory_info RPC failed, using fallback:", error);
    return await checkMandatoryInfoManually(classDbId, studentId);
  }

  return data as boolean;
}

/**
 * Fallback manual check for mandatory info completion
 */
async function checkMandatoryInfoManually(
  classDbId: string,
  studentId: string
): Promise<boolean> {
  const fields = await getMandatoryFieldsForClass(classDbId);
  
  // If no mandatory fields, return true
  if (fields.length === 0) {
    return true;
  }

  const studentInfo = await getStudentClassInfo(classDbId, studentId);
  
  // If no info submitted, return false
  if (!studentInfo) {
    return false;
  }

  // Check if all fields have non-empty responses
  const responses = studentInfo.field_responses;
  for (const field of fields) {
    const response = responses[field.id];
    if (!response || response.trim() === "") {
      return false;
    }
  }

  return true;
}
