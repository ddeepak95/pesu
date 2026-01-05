-- Migration: Add function to get class students with user info (email and display name) and group info
-- This function returns class students along with their email, display name, and group assignment

-- Function to get class students with user info and group
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




