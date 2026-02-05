-- Profile Fields Migration
-- Extends class_mandatory_fields with is_mandatory and is_display_name columns
-- Updates helper functions to support optional fields and profile-based display names

-- =====================================================
-- ADD COLUMNS
-- =====================================================

ALTER TABLE class_mandatory_fields ADD COLUMN IF NOT EXISTS is_mandatory BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE class_mandatory_fields ADD COLUMN IF NOT EXISTS is_display_name BOOLEAN NOT NULL DEFAULT FALSE;

-- =====================================================
-- UPDATED FUNCTIONS
-- =====================================================

-- Check if a student has completed all MANDATORY profile fields for a class
CREATE OR REPLACE FUNCTION has_completed_mandatory_info(p_class_id UUID, p_student_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_field_count INTEGER;
  v_response_count INTEGER;
  v_field_ids UUID[];
  v_responses JSONB;
BEGIN
  -- Get only mandatory field IDs for the class
  SELECT array_agg(id) INTO v_field_ids
  FROM class_mandatory_fields
  WHERE class_id = p_class_id AND is_mandatory = TRUE;

  -- If no mandatory fields, return true
  IF v_field_ids IS NULL OR array_length(v_field_ids, 1) IS NULL THEN
    RETURN TRUE;
  END IF;

  v_field_count := array_length(v_field_ids, 1);

  -- Get student's responses
  SELECT field_responses INTO v_responses
  FROM student_class_info
  WHERE class_id = p_class_id AND student_id = p_student_id;

  -- If no response record exists, return false
  IF v_responses IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Count how many mandatory fields have non-empty responses
  SELECT COUNT(*) INTO v_response_count
  FROM unnest(v_field_ids) AS field_id
  WHERE v_responses->>field_id::text IS NOT NULL 
    AND v_responses->>field_id::text <> '';

  -- Return true if all mandatory fields have responses
  RETURN v_response_count >= v_field_count;
END;
$$;

-- Updated: Get class students with user info, now resolves profile display name
CREATE OR REPLACE FUNCTION get_class_students_with_user_info(p_class_id UUID)
RETURNS TABLE (
  student_id UUID,
  joined_at TIMESTAMP WITH TIME ZONE,
  student_email TEXT,
  student_display_name TEXT,
  group_id UUID,
  group_name TEXT,
  group_index INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    cs.student_id,
    cs.joined_at,
    au.email::TEXT as student_email,
    COALESCE(
      -- Profile display name: value of the field marked as display name
      (SELECT sci.field_responses->>cmf.id::text
       FROM student_class_info sci
       JOIN class_mandatory_fields cmf ON cmf.class_id = cs.class_id AND cmf.is_display_name = TRUE
       WHERE sci.class_id = cs.class_id AND sci.student_id = cs.student_id
       LIMIT 1),
      -- Fallback: auth provider display name
      au.raw_user_meta_data->>'display_name',
      au.raw_user_meta_data->>'name',
      au.raw_user_meta_data->>'full_name'
    )::TEXT as student_display_name,
    cgm.group_id,
    cg.name::TEXT as group_name,
    cg.group_index
  FROM class_students cs
  LEFT JOIN auth.users au ON cs.student_id = au.id
  LEFT JOIN class_group_memberships cgm ON cs.class_id = cgm.class_id AND cs.student_id = cgm.student_id
  LEFT JOIN class_groups cg ON cgm.group_id = cg.id
  WHERE cs.class_id = p_class_id
  ORDER BY cs.joined_at DESC;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_class_students_with_user_info(UUID) TO authenticated;
