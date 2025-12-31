-- Migration: Add RLS policy to allow students to view content items for their assigned group
-- Requires: 
--   - supabase_content_items_migration.sql
--   - supabase_group_scoped_content_alter.sql
--   - supabase_class_groups_migration.sql

-- Helper function: Check if current user is a student enrolled in a class and assigned to a specific group
CREATE OR REPLACE FUNCTION is_student_in_group(p_class_id UUID, p_group_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM class_students cs
    JOIN class_group_memberships cgm ON cs.class_id = cgm.class_id AND cs.student_id = cgm.student_id
    WHERE cs.class_id = p_class_id
      AND cs.student_id = auth.uid()
      AND cgm.group_id = p_group_id
  );
$$;

-- Policy: Students can view content items for their assigned group
DROP POLICY IF EXISTS "Students can view content items for their group" ON content_items;
CREATE POLICY "Students can view content items for their group" ON content_items
  FOR SELECT
  USING (
    class_group_id IS NOT NULL
    AND is_student_in_group(class_id, class_group_id)
    AND status IN ('active', 'draft')
  );

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION is_student_in_group(UUID, UUID) TO authenticated;


