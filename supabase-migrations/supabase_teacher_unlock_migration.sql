-- Teacher Content Unlock Migration
-- Allows teachers to gate content items behind manual per-student unlock.
-- When require_teacher_unlock is true on a content item, students cannot
-- access it until a teacher explicitly unlocks it for them.

-- ============================================
-- COLUMN: require_teacher_unlock on content_items
-- ============================================

ALTER TABLE public.content_items
ADD COLUMN IF NOT EXISTS require_teacher_unlock BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN content_items.require_teacher_unlock IS
  'When true, this content item is locked for students until a teacher explicitly unlocks it per student.';

-- ============================================
-- TABLE: teacher_content_unlocks
-- ============================================

CREATE TABLE IF NOT EXISTS teacher_content_unlocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id UUID NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  unlocked_by UUID NOT NULL REFERENCES auth.users(id),
  unlocked_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(content_item_id, student_id)
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_teacher_content_unlocks_content_item_id
  ON teacher_content_unlocks(content_item_id);

CREATE INDEX IF NOT EXISTS idx_teacher_content_unlocks_student_id
  ON teacher_content_unlocks(student_id);

CREATE INDEX IF NOT EXISTS idx_teacher_content_unlocks_content_student
  ON teacher_content_unlocks(content_item_id, student_id);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE teacher_content_unlocks ENABLE ROW LEVEL SECURITY;

-- Students can view their own unlock rows
CREATE POLICY "Students can view own unlocks"
  ON teacher_content_unlocks FOR SELECT
  USING (auth.uid() = student_id);

-- Teachers can view unlocks for content items in their classes
CREATE POLICY "Teachers can view class unlocks"
  ON teacher_content_unlocks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM content_items ci
      JOIN classes c ON ci.class_id = c.id
      WHERE ci.id = teacher_content_unlocks.content_item_id
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

-- Teachers can insert unlocks for content items in their classes
CREATE POLICY "Teachers can insert class unlocks"
  ON teacher_content_unlocks FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM content_items ci
      JOIN classes c ON ci.class_id = c.id
      WHERE ci.id = teacher_content_unlocks.content_item_id
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

-- Teachers can delete (re-lock) unlocks for content items in their classes
CREATE POLICY "Teachers can delete class unlocks"
  ON teacher_content_unlocks FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM content_items ci
      JOIN classes c ON ci.class_id = c.id
      WHERE ci.id = teacher_content_unlocks.content_item_id
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

COMMENT ON TABLE teacher_content_unlocks IS
  'Tracks which content items have been explicitly unlocked by a teacher for individual students.';
COMMENT ON COLUMN teacher_content_unlocks.content_item_id IS
  'The content item that was unlocked';
COMMENT ON COLUMN teacher_content_unlocks.student_id IS
  'The student for whom the content was unlocked';
COMMENT ON COLUMN teacher_content_unlocks.unlocked_by IS
  'The teacher who performed the unlock';
COMMENT ON COLUMN teacher_content_unlocks.unlocked_at IS
  'When the unlock occurred';
