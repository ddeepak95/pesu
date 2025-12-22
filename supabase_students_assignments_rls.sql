-- Migration: Add RLS policy to allow students to view assignments for their assigned group
-- Requires: 
--   - supabase_assignments_migration.sql
--   - supabase_group_scoped_content_alter.sql (adds class_group_id column)
--   - supabase_class_groups_migration.sql

-- Policy: Students can view assignments for their assigned group
DROP POLICY IF EXISTS "Students can view assignments for their group" ON assignments;
CREATE POLICY "Students can view assignments for their group" ON assignments
  FOR SELECT
  USING (
    class_group_id IS NOT NULL
    AND is_student_in_group(class_id, class_group_id)
    AND status = 'active'
  );

