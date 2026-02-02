-- Mandatory Student Information
-- Allows teachers to define mandatory fields that students must fill before accessing class content
-- Assumes existing tables:
-- - classes(id uuid pk, created_by uuid, ...)
-- - class_teachers(class_id uuid fk -> classes.id, teacher_id uuid, role text, ...)
-- - class_students(class_id uuid, student_id uuid, ...)

-- =====================================================
-- TABLES
-- =====================================================

-- Mandatory fields defined by teachers per class
CREATE TABLE IF NOT EXISTS class_mandatory_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  field_type TEXT NOT NULL CHECK (field_type IN ('text', 'dropdown')),
  options JSONB,  -- For dropdown: ["Option 1", "Option 2", ...]
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_class_mandatory_fields_class_id ON class_mandatory_fields(class_id);

-- Student responses to mandatory fields
CREATE TABLE IF NOT EXISTS student_class_info (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  student_id UUID NOT NULL,
  field_responses JSONB NOT NULL DEFAULT '{}',  -- { "field_id": "response_value" }
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE (class_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_student_class_info_class_id ON student_class_info(class_id);
CREATE INDEX IF NOT EXISTS idx_student_class_info_student_id ON student_class_info(student_id);

-- =====================================================
-- TRIGGERS
-- =====================================================

-- Updated_at trigger for class_mandatory_fields
DROP TRIGGER IF EXISTS update_class_mandatory_fields_updated_at ON class_mandatory_fields;
CREATE TRIGGER update_class_mandatory_fields_updated_at
  BEFORE UPDATE ON class_mandatory_fields
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Updated_at trigger for student_class_info
DROP TRIGGER IF EXISTS update_student_class_info_updated_at ON student_class_info;
CREATE TRIGGER update_student_class_info_updated_at
  BEFORE UPDATE ON student_class_info
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

-- Check if a student has completed all mandatory fields for a class
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
  -- Get all mandatory field IDs for the class
  SELECT array_agg(id) INTO v_field_ids
  FROM class_mandatory_fields
  WHERE class_id = p_class_id;

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

  -- Count how many fields have non-empty responses
  SELECT COUNT(*) INTO v_response_count
  FROM unnest(v_field_ids) AS field_id
  WHERE v_responses->>field_id::text IS NOT NULL 
    AND v_responses->>field_id::text <> '';

  -- Return true if all fields have responses
  RETURN v_response_count >= v_field_count;
END;
$$;

-- Get mandatory fields for a class (ordered by position)
CREATE OR REPLACE FUNCTION get_class_mandatory_fields(p_class_id UUID)
RETURNS SETOF class_mandatory_fields
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
  SELECT * FROM class_mandatory_fields
  WHERE class_id = p_class_id
  ORDER BY position ASC, created_at ASC;
$$;

-- Get student's class info
CREATE OR REPLACE FUNCTION get_student_class_info(p_class_id UUID, p_student_id UUID)
RETURNS student_class_info
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
  SELECT * FROM student_class_info
  WHERE class_id = p_class_id AND student_id = p_student_id
  LIMIT 1;
$$;

-- Upsert student class info
CREATE OR REPLACE FUNCTION upsert_student_class_info(
  p_class_id UUID,
  p_student_id UUID,
  p_field_responses JSONB
)
RETURNS student_class_info
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result student_class_info;
BEGIN
  -- Verify student is enrolled in the class
  IF NOT EXISTS (
    SELECT 1 FROM class_students
    WHERE class_id = p_class_id AND student_id = p_student_id
  ) THEN
    RAISE EXCEPTION 'Student is not enrolled in this class';
  END IF;

  -- Upsert the info
  INSERT INTO student_class_info (class_id, student_id, field_responses)
  VALUES (p_class_id, p_student_id, p_field_responses)
  ON CONFLICT (class_id, student_id)
  DO UPDATE SET 
    field_responses = p_field_responses,
    updated_at = timezone('utc'::text, now())
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

-- =====================================================
-- RLS POLICIES
-- =====================================================

ALTER TABLE class_mandatory_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_class_info ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "Teachers can view mandatory fields" ON class_mandatory_fields;
DROP POLICY IF EXISTS "Teachers can manage mandatory fields" ON class_mandatory_fields;
DROP POLICY IF EXISTS "Students can view mandatory fields" ON class_mandatory_fields;
DROP POLICY IF EXISTS "Students can view their class info" ON student_class_info;
DROP POLICY IF EXISTS "Students can manage their class info" ON student_class_info;
DROP POLICY IF EXISTS "Teachers can view student class info" ON student_class_info;

-- Teachers can view mandatory fields for their classes
CREATE POLICY "Teachers can view mandatory fields" ON class_mandatory_fields
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM classes
      WHERE classes.id = class_mandatory_fields.class_id
      AND (
        classes.created_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM class_teachers
          WHERE class_teachers.class_id = classes.id
          AND class_teachers.teacher_id = auth.uid()
        )
      )
    )
  );

-- Teachers can manage (insert/update/delete) mandatory fields for their classes
CREATE POLICY "Teachers can manage mandatory fields" ON class_mandatory_fields
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM classes
      WHERE classes.id = class_mandatory_fields.class_id
      AND (
        classes.created_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM class_teachers
          WHERE class_teachers.class_id = classes.id
          AND class_teachers.teacher_id = auth.uid()
        )
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM classes
      WHERE classes.id = class_mandatory_fields.class_id
      AND (
        classes.created_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM class_teachers
          WHERE class_teachers.class_id = classes.id
          AND class_teachers.teacher_id = auth.uid()
        )
      )
    )
  );

-- Students can view mandatory fields for classes they're enrolled in
CREATE POLICY "Students can view mandatory fields" ON class_mandatory_fields
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM class_students
      WHERE class_students.class_id = class_mandatory_fields.class_id
      AND class_students.student_id = auth.uid()
    )
  );

-- Students can view their own class info
CREATE POLICY "Students can view their class info" ON student_class_info
  FOR SELECT
  USING (auth.uid() = student_id);

-- Students can insert/update their own class info
CREATE POLICY "Students can manage their class info" ON student_class_info
  FOR ALL
  USING (auth.uid() = student_id)
  WITH CHECK (auth.uid() = student_id);

-- Teachers can view student class info for their classes
CREATE POLICY "Teachers can view student class info" ON student_class_info
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM classes
      WHERE classes.id = student_class_info.class_id
      AND (
        classes.created_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM class_teachers
          WHERE class_teachers.class_id = classes.id
          AND class_teachers.teacher_id = auth.uid()
        )
      )
    )
  );
