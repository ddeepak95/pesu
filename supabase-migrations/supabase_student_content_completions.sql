-- Student Content Completions Migration
-- Tracks which students have marked which content items as complete

-- ============================================
-- TABLE: student_content_completions
-- ============================================

CREATE TABLE IF NOT EXISTS student_content_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content_item_id UUID NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(student_id, content_item_id)
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_student_content_completions_student_id 
  ON student_content_completions(student_id);

CREATE INDEX IF NOT EXISTS idx_student_content_completions_content_item_id 
  ON student_content_completions(content_item_id);

CREATE INDEX IF NOT EXISTS idx_student_content_completions_completed_at 
  ON student_content_completions(completed_at);

-- Composite index for efficient lookups by student and multiple content items
CREATE INDEX IF NOT EXISTS idx_student_content_completions_student_content 
  ON student_content_completions(student_id, content_item_id);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE student_content_completions ENABLE ROW LEVEL SECURITY;

-- Students can insert their own completions
CREATE POLICY "Students can insert own completions"
  ON student_content_completions FOR INSERT
  WITH CHECK (auth.uid() = student_id);

-- Students can view their own completions
CREATE POLICY "Students can view own completions"
  ON student_content_completions FOR SELECT
  USING (auth.uid() = student_id);

-- Students can delete their own completions (to unmark)
CREATE POLICY "Students can delete own completions"
  ON student_content_completions FOR DELETE
  USING (auth.uid() = student_id);

-- Teachers can view completions for content items in their classes
CREATE POLICY "Teachers can view class completions"
  ON student_content_completions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM content_items ci
      JOIN classes c ON ci.class_id = c.id
      WHERE ci.id = student_content_completions.content_item_id
      AND (
        c.created_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM class_teachers ct
          WHERE ct.class_id = c.id
          AND ct.teacher_id = auth.uid()
        )
      )
    )
  );

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE student_content_completions IS 'Tracks which students have manually marked content items as complete';
COMMENT ON COLUMN student_content_completions.student_id IS 'The student who marked the content as complete';
COMMENT ON COLUMN student_content_completions.content_item_id IS 'The content item that was marked complete';
COMMENT ON COLUMN student_content_completions.completed_at IS 'When the content was marked as complete';
