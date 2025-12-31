-- Migration: Add function to get class teachers with user info (email and display name)
-- This function returns class teachers along with their email and display name from auth.users

-- Function to get class teachers with user info
CREATE OR REPLACE FUNCTION get_class_teachers_with_user_info(p_class_id UUID)
RETURNS TABLE (
  id UUID,
  class_id UUID,
  teacher_id UUID,
  role TEXT,
  joined_at TIMESTAMP WITH TIME ZONE,
  teacher_email TEXT,
  teacher_display_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ct.id,
    ct.class_id,
    ct.teacher_id,
    ct.role,
    ct.joined_at,
    au.email::TEXT as teacher_email,
    COALESCE(
      au.raw_user_meta_data->>'display_name',
      au.raw_user_meta_data->>'name',
      au.raw_user_meta_data->>'full_name'
    )::TEXT as teacher_display_name
  FROM class_teachers ct
  LEFT JOIN auth.users au ON ct.teacher_id = au.id
  WHERE ct.class_id = p_class_id
  ORDER BY ct.joined_at ASC;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_class_teachers_with_user_info(UUID) TO authenticated;


