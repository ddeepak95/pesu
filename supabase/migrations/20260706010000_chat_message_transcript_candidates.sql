-- Dual-transcript audit trail: when a student's audio in a speaking_practice
-- turn is transcribed in two languages simultaneously (primary + support
-- language), the model picks one reading as `content` (the chosen, verbatim
-- transcript) but the other raw reading was previously discarded entirely.
--
-- This column preserves BOTH raw STT candidates as heard, for audit purposes,
-- independent of whichever one was chosen as the persisted `content`.

ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS transcript_candidates jsonb;

COMMENT ON COLUMN public.chat_messages.transcript_candidates IS
  'Audit copy of the raw dual-transcript STT candidates for this message: jsonb array of { language, text }, in the order [primary language, support language]. Null for single-transcript turns (language support not enabled/no dual STT) and for assistant messages. `content` holds whichever candidate was chosen (or the model''s fallback), verbatim; this column is the untouched raw pair for audit.';
