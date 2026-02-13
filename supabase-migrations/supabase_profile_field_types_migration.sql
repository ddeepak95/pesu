-- Profile Field Types Migration
-- Adds 'number' and 'phone' field types to class_mandatory_fields

-- Drop existing check constraint (name may vary; try common pattern)
ALTER TABLE class_mandatory_fields
  DROP CONSTRAINT IF EXISTS class_mandatory_fields_field_type_check;

-- Add new constraint with expanded field types
ALTER TABLE class_mandatory_fields
  ADD CONSTRAINT class_mandatory_fields_field_type_check
  CHECK (field_type IN ('text', 'dropdown', 'number', 'phone'));
