-- AI metadata on chat assistant replies (key source, provider, model).

ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS ai_key_source text,
  ADD COLUMN IF NOT EXISTS ai_provider text,
  ADD COLUMN IF NOT EXISTS ai_model_id text;
