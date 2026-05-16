-- AI invocation audit index (payloads in GCS under ai-logs/{id}/).

CREATE TABLE IF NOT EXISTS public.ai_invocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  app_function_key text NOT NULL,

  ai_provider text,
  ai_model_id text,
  ai_key_source text,

  class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  assignment_id text,
  submission_id text,
  question_order int,
  attempt_number int,

  related_entity_type text,
  related_entity_id uuid,

  request_storage_path text NOT NULL,
  response_storage_path text,

  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'failed')),
  error_message text,

  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  duration_ms int,

  prompt_tokens int,
  completion_tokens int,
  total_tokens int,

  retry_of uuid REFERENCES public.ai_invocations(id) ON DELETE SET NULL,
  retry_index int NOT NULL DEFAULT 0,

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_invocations_submission_fn_started_idx
  ON public.ai_invocations (submission_id, app_function_key, started_at DESC);

CREATE INDEX IF NOT EXISTS ai_invocations_assignment_started_idx
  ON public.ai_invocations (assignment_id, started_at DESC)
  WHERE assignment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ai_invocations_app_function_started_idx
  ON public.ai_invocations (app_function_key, started_at DESC);

CREATE INDEX IF NOT EXISTS ai_invocations_pending_idx
  ON public.ai_invocations (started_at)
  WHERE status = 'pending';

ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS ai_invocation_id uuid
    REFERENCES public.ai_invocations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS chat_messages_ai_invocation_id_idx
  ON public.chat_messages (ai_invocation_id)
  WHERE ai_invocation_id IS NOT NULL;

ALTER TABLE public.ai_invocations ENABLE ROW LEVEL SECURITY;
