-- Migration: Optimize submission storage
-- 1. Rename answers -> evaluations (JSONB now only holds scores/rubric/feedback)
-- 2. Create static_activity table (detailed log for static_text mode)
-- 3. Create submission_transcripts table (unified archive for ALL modes)
-- 4. Add denormalized columns to submissions for list views

-- 1. Rename answers column to evaluations
ALTER TABLE public.submissions RENAME COLUMN answers TO evaluations;

COMMENT ON COLUMN public.submissions.evaluations IS 'JSONB holding per-question evaluation data (scores, rubric_scores, evaluation_feedback, attempt metadata). Transcripts are stored separately in submission_transcripts.';

-- 2. Static activity table (detailed log for static_text mode)
-- Parallels voice_messages (voice) and chat_messages (chat)
CREATE TABLE public.static_activity (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    submission_id text NOT NULL,
    assignment_id text NOT NULL,
    question_order integer NOT NULL,
    attempt_number integer NOT NULL,
    content text NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT unique_static_activity UNIQUE (submission_id, question_order, attempt_number)
);

CREATE INDEX idx_static_activity_submission ON public.static_activity(submission_id);

COMMENT ON TABLE public.static_activity IS 'Stores typed text entries for static_text submission mode (parallels voice_messages and chat_messages)';

-- 3. Submission transcripts table (unified archive for ALL modes)
-- Stores the clean, frontend-assembled transcript per attempt
CREATE TABLE public.submission_transcripts (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    submission_id text NOT NULL,
    question_order integer NOT NULL,
    attempt_number integer NOT NULL,
    answer_text text NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT unique_transcript UNIQUE (submission_id, question_order, attempt_number)
);

CREATE INDEX idx_transcripts_submission ON public.submission_transcripts(submission_id);

COMMENT ON TABLE public.submission_transcripts IS 'Reliable archive of aggregated transcripts per attempt, used as primary read path for transcript display and session restore';

-- 4. Denormalized columns on submissions for list views
ALTER TABLE public.submissions
    ADD COLUMN IF NOT EXISTS has_attempts boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS highest_score integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS max_score integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS total_attempts integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.submissions.has_attempts IS 'Whether the submission has any non-stale attempts (denormalized from evaluations JSONB)';
COMMENT ON COLUMN public.submissions.highest_score IS 'Sum of highest scores per question across non-stale attempts (denormalized)';
COMMENT ON COLUMN public.submissions.max_score IS 'Sum of max possible scores across questions (denormalized)';
COMMENT ON COLUMN public.submissions.total_attempts IS 'Total count of non-stale attempts across all questions (denormalized)';
