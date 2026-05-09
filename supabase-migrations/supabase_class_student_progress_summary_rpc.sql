-- Per-student progress aggregates for teacher Progress / Analytics (group-scoped content).
-- Matches client logic in useClassStudentsData.progressStatsMap:
-- - Ungrouped students count only class-level content (class_group_id IS NULL).
-- - Grouped students count only content in their placement group.

CREATE OR REPLACE FUNCTION public.get_class_student_progress_summary(p_class_id UUID)
RETURNS TABLE (
  student_id UUID,
  total BIGINT,
  completed BIGINT,
  last_completed_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM classes c
    WHERE c.id = p_class_id
      AND (
        c.created_by = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM class_teachers ct
          WHERE ct.class_id = c.id
            AND ct.teacher_id = auth.uid()
        )
      )
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH active_students AS (
    SELECT
      cs.student_id,
      cgm.group_id AS student_group_id
    FROM class_students cs
    LEFT JOIN class_group_memberships cgm
      ON cgm.class_id = cs.class_id
     AND cgm.student_id = cs.student_id
    WHERE cs.class_id = p_class_id
      AND cs.status = 'active'
  ),
  scoped_content AS (
    SELECT ci.id AS content_item_id,
           ci.class_group_id
    FROM content_items ci
    WHERE ci.class_id = p_class_id
      AND ci.status IN ('active', 'draft')
  ),
  student_scope AS (
    SELECT s.student_id,
           sc.content_item_id
    FROM active_students s
    CROSS JOIN scoped_content sc
    WHERE (s.student_group_id IS NULL AND sc.class_group_id IS NULL)
       OR (s.student_group_id IS NOT NULL AND sc.class_group_id = s.student_group_id)
  ),
  completions AS (
    SELECT scc.student_id,
           scc.content_item_id,
           scc.completed_at
    FROM student_content_completions scc
    INNER JOIN scoped_content sc ON sc.content_item_id = scc.content_item_id
    INNER JOIN active_students ast ON ast.student_id = scc.student_id
  )
  SELECT
    ast.student_id,
    COUNT(ss.content_item_id)::bigint AS total,
    COUNT(c.completed_at)::bigint AS completed,
    MAX(c.completed_at) AS last_completed_at
  FROM active_students ast
  LEFT JOIN student_scope ss ON ss.student_id = ast.student_id
  LEFT JOIN completions c
    ON c.student_id = ss.student_id
   AND c.content_item_id = ss.content_item_id
  GROUP BY ast.student_id;
END;
$$;

COMMENT ON FUNCTION public.get_class_student_progress_summary(UUID) IS
  'Teacher/co-teacher: per enrolled student, counts of group-scoped content items and completions plus max(completed_at).';

GRANT EXECUTE ON FUNCTION public.get_class_student_progress_summary(UUID) TO authenticated;
