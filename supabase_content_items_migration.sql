-- Create content_items table (unified ordered Content feed)
CREATE TABLE IF NOT EXISTS content_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id TEXT UNIQUE NOT NULL,
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('quiz', 'learning_content', 'formative_assignment')),
  ref_id UUID NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  due_at TIMESTAMP WITH TIME ZONE,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('draft', 'active', 'deleted'))
);

CREATE INDEX IF NOT EXISTS idx_content_items_class_id ON content_items(class_id);
CREATE INDEX IF NOT EXISTS idx_content_items_class_position ON content_items(class_id, position);
CREATE INDEX IF NOT EXISTS idx_content_items_type ON content_items(type);
CREATE INDEX IF NOT EXISTS idx_content_items_ref_id ON content_items(ref_id);
CREATE INDEX IF NOT EXISTS idx_content_items_status ON content_items(status);

ALTER TABLE content_items ENABLE ROW LEVEL SECURITY;

-- Create content_item_overrides table (future per-group overrides)
CREATE TABLE IF NOT EXISTS content_item_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id UUID NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
  group_key TEXT NOT NULL,
  position INTEGER,
  due_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_content_item_overrides_content_item_id
  ON content_item_overrides(content_item_id);
CREATE INDEX IF NOT EXISTS idx_content_item_overrides_group_key
  ON content_item_overrides(group_key);

ALTER TABLE content_item_overrides ENABLE ROW LEVEL SECURITY;

-- RLS policies for content_items (mirrors assignments access rules)
CREATE POLICY "Teachers can view their class content items" ON content_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM classes
      WHERE classes.id = content_items.class_id
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

CREATE POLICY "Teachers can create content items for their classes" ON content_items
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM classes
      WHERE classes.id = content_items.class_id
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

CREATE POLICY "Teachers can update their class content items" ON content_items
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM classes
      WHERE classes.id = content_items.class_id
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
      WHERE classes.id = content_items.class_id
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

CREATE POLICY "Teachers can delete their class content items" ON content_items
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM classes
      WHERE classes.id = content_items.class_id
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

-- RLS policies for overrides: access derived from owning content_item -> class
CREATE POLICY "Teachers can view content item overrides" ON content_item_overrides
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM content_items ci
      JOIN classes c ON c.id = ci.class_id
      WHERE ci.id = content_item_overrides.content_item_id
      AND (
        c.created_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM class_teachers
          WHERE class_teachers.class_id = c.id
          AND class_teachers.teacher_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "Teachers can create content item overrides" ON content_item_overrides
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM content_items ci
      JOIN classes c ON c.id = ci.class_id
      WHERE ci.id = content_item_overrides.content_item_id
      AND (
        c.created_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM class_teachers
          WHERE class_teachers.class_id = c.id
          AND class_teachers.teacher_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "Teachers can update content item overrides" ON content_item_overrides
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM content_items ci
      JOIN classes c ON c.id = ci.class_id
      WHERE ci.id = content_item_overrides.content_item_id
      AND (
        c.created_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM class_teachers
          WHERE class_teachers.class_id = c.id
          AND class_teachers.teacher_id = auth.uid()
        )
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM content_items ci
      JOIN classes c ON c.id = ci.class_id
      WHERE ci.id = content_item_overrides.content_item_id
      AND (
        c.created_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM class_teachers
          WHERE class_teachers.class_id = c.id
          AND class_teachers.teacher_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "Teachers can delete content item overrides" ON content_item_overrides
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM content_items ci
      JOIN classes c ON c.id = ci.class_id
      WHERE ci.id = content_item_overrides.content_item_id
      AND (
        c.created_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM class_teachers
          WHERE class_teachers.class_id = c.id
          AND class_teachers.teacher_id = auth.uid()
        )
      )
    )
  );

-- updated_at trigger function (shared)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_content_items_updated_at ON content_items;
CREATE TRIGGER update_content_items_updated_at
  BEFORE UPDATE ON content_items
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_content_item_overrides_updated_at ON content_item_overrides;
CREATE TRIGGER update_content_item_overrides_updated_at
  BEFORE UPDATE ON content_item_overrides
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Backfill: create content_items for existing formative assignments
-- Notes:
-- - Uses 8-char hex from gen_random_bytes as content_item_id.
-- - Positions are assigned per class by created_at order.
INSERT INTO content_items (
  content_item_id,
  class_id,
  type,
  ref_id,
  position,
  due_at,
  created_by,
  status
)
SELECT
  encode(gen_random_bytes(4), 'hex') AS content_item_id,
  a.class_id,
  'formative_assignment' AS type,
  a.id AS ref_id,
  (row_number() OVER (PARTITION BY a.class_id ORDER BY a.created_at ASC) - 1)::int AS position,
  NULL::timestamptz AS due_at,
  a.created_by,
  a.status AS status
FROM assignments a
WHERE a.status IN ('active', 'draft')
  AND NOT EXISTS (
    SELECT 1 FROM content_items ci
    WHERE ci.type = 'formative_assignment'
      AND ci.ref_id = a.id
  );

