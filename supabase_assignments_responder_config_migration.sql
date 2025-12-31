-- Migration: Add responder_fields_config to assignments table
-- This allows teachers to configure what information to collect from public assignment responders

ALTER TABLE assignments 
  ADD COLUMN IF NOT EXISTS responder_fields_config JSONB DEFAULT NULL;

COMMENT ON COLUMN assignments.responder_fields_config IS 
  'Configuration for responder details collection in public assignments. Array of field definitions: {field: string, type: "text"|"email"|"tel"|"select", label: string, required: boolean, placeholder?: string, options?: string[]}';


