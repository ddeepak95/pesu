-- Linked placements: multiple content_items per (type, ref_id) across groups.
-- 1) Student SELECT on entities follows active content_items placement + group membership
-- 2) Partial UNIQUE: at most one active/draft placement per (class, group, type, ref)
-- 3) Index to support EXISTS in RLS
-- 4) Trigger: validate (type, ref_id) points at a row in the correct table

-- ---------------------------------------------------------------------------
-- A) Partial unique index (one placement per group per material)
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS idx_content_items_unique_ref_per_group
  ON content_items (class_id, class_group_id, type, ref_id)
  WHERE class_group_id IS NOT NULL
    AND status IN ('active', 'draft');

-- ---------------------------------------------------------------------------
-- B) Supporting index for placement-based student RLS EXISTS subqueries
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_content_items_student_entity_lookup
  ON content_items (class_id, type, ref_id, class_group_id)
  WHERE status = 'active';

-- ---------------------------------------------------------------------------
-- C) Validate polymorphic ref_id on content_items
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.content_items_validate_ref()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.type = 'quiz' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.quizzes q
      WHERE q.id = NEW.ref_id AND q.class_id = NEW.class_id
    ) THEN
      RAISE EXCEPTION 'content_items: quiz ref_id % not found for class', NEW.ref_id;
    END IF;
  ELSIF NEW.type = 'learning_content' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.learning_contents lc
      WHERE lc.id = NEW.ref_id AND lc.class_id = NEW.class_id
    ) THEN
      RAISE EXCEPTION 'content_items: learning_content ref_id % not found for class', NEW.ref_id;
    END IF;
  ELSIF NEW.type = 'formative_assignment' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.assignments a
      WHERE a.id = NEW.ref_id AND a.class_id = NEW.class_id
    ) THEN
      RAISE EXCEPTION 'content_items: formative_assignment ref_id % not found for class', NEW.ref_id;
    END IF;
  ELSIF NEW.type = 'survey' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.surveys s
      WHERE s.id = NEW.ref_id AND s.class_id = NEW.class_id
    ) THEN
      RAISE EXCEPTION 'content_items: survey ref_id % not found for class', NEW.ref_id;
    END IF;
  ELSE
    RAISE EXCEPTION 'content_items: unknown type %', NEW.type;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_content_items_validate_ref ON public.content_items;
CREATE TRIGGER trg_content_items_validate_ref
  BEFORE INSERT OR UPDATE OF type, ref_id, class_id
  ON public.content_items
  FOR EACH ROW
  EXECUTE FUNCTION public.content_items_validate_ref();

-- ---------------------------------------------------------------------------
-- D) Student policies: visibility via active placement in student's group
-- ---------------------------------------------------------------------------

-- Assignments
DROP POLICY IF EXISTS "Students can view assignments for their group" ON public.assignments;
CREATE POLICY "Students can view assignments for their group" ON public.assignments
  FOR SELECT
  USING (
    status = 'active'
    AND EXISTS (
      SELECT 1
      FROM public.content_items ci
      WHERE ci.class_id = assignments.class_id
        AND ci.ref_id = assignments.id
        AND ci.type = 'formative_assignment'
        AND ci.class_group_id IS NOT NULL
        AND ci.status = 'active'
        AND public.is_student_in_group(ci.class_id, ci.class_group_id)
    )
  );

-- Quizzes
DROP POLICY IF EXISTS "Students can view quizzes for their group" ON public.quizzes;
CREATE POLICY "Students can view quizzes for their group" ON public.quizzes
  FOR SELECT
  USING (
    status = 'active'
    AND EXISTS (
      SELECT 1
      FROM public.content_items ci
      WHERE ci.class_id = quizzes.class_id
        AND ci.ref_id = quizzes.id
        AND ci.type = 'quiz'
        AND ci.class_group_id IS NOT NULL
        AND ci.status = 'active'
        AND public.is_student_in_group(ci.class_id, ci.class_group_id)
    )
  );

-- Learning contents
DROP POLICY IF EXISTS "Students can view learning contents for their group" ON public.learning_contents;
CREATE POLICY "Students can view learning contents for their group" ON public.learning_contents
  FOR SELECT
  USING (
    status = 'active'
    AND EXISTS (
      SELECT 1
      FROM public.content_items ci
      WHERE ci.class_id = learning_contents.class_id
        AND ci.ref_id = learning_contents.id
        AND ci.type = 'learning_content'
        AND ci.class_group_id IS NOT NULL
        AND ci.status = 'active'
        AND public.is_student_in_group(ci.class_id, ci.class_group_id)
    )
  );

-- Surveys (SELECT)
DROP POLICY IF EXISTS "Students can view active surveys in their group" ON public.surveys;
CREATE POLICY "Students can view active surveys in their group" ON public.surveys
  FOR SELECT
  USING (
    status = 'active'
    AND EXISTS (
      SELECT 1
      FROM public.content_items ci
      WHERE ci.class_id = surveys.class_id
        AND ci.ref_id = surveys.id
        AND ci.type = 'survey'
        AND ci.class_group_id IS NOT NULL
        AND ci.status = 'active'
        AND public.is_student_in_group(ci.class_id, ci.class_group_id)
    )
  );

-- Survey responses: allow submit when student has an active placement for the survey
DROP POLICY IF EXISTS "Students can submit their own responses" ON public.survey_responses;
CREATE POLICY "Students can submit their own responses" ON public.survey_responses
  FOR INSERT
  WITH CHECK (
    student_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.surveys s
      WHERE s.id = survey_responses.survey_id
        AND s.status = 'active'
        AND EXISTS (
          SELECT 1
          FROM public.content_items ci
          WHERE ci.class_id = s.class_id
            AND ci.ref_id = s.id
            AND ci.type = 'survey'
            AND ci.class_group_id IS NOT NULL
            AND ci.status = 'active'
            AND public.is_student_in_group(ci.class_id, ci.class_group_id)
        )
    )
  );
