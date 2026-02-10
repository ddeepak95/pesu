-- Migration: Add progress_view_config JSONB column to classes table
-- This stores the shared configuration for the Student Progress dialog,
-- including which profile fields to display under student names and
-- which dropdown fields to use as filters.
--
-- Shape: { "display_fields": ["field-id-1", ...], "filter_fields": ["field-id-2", ...] }
-- NULL means no configuration (default view: name + email only, no profile filters).

ALTER TABLE public.classes
ADD COLUMN IF NOT EXISTS progress_view_config JSONB DEFAULT NULL;
