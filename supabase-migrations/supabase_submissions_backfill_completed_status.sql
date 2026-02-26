-- Backfill: update submissions stuck at 'in_progress' whose student has already
-- marked the corresponding content item as complete via student_content_completions.
--
-- Join path:
--   submissions.assignment_id (text)
--   → assignments.assignment_id (text)
--   → assignments.id (uuid)
--   → content_items.ref_id (uuid, type = 'formative_assignment')
--   → content_items.id
--   → student_content_completions.content_item_id + student_id

UPDATE submissions s
SET status = 'completed',
    submitted_at = COALESCE(s.submitted_at, scc.completed_at),
    updated_at = NOW()
FROM assignments a
JOIN content_items ci ON ci.ref_id = a.id AND ci.type = 'formative_assignment'
JOIN student_content_completions scc ON scc.content_item_id = ci.id
WHERE a.assignment_id = s.assignment_id
  AND scc.student_id = s.student_id
  AND s.status = 'in_progress'
  AND s.student_id IS NOT NULL;
