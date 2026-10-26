alter table public.class_documents
  add column if not exists processing_run_id uuid,
  add column if not exists processing_stage text,
  add column if not exists processed_pages integer not null default 0;

alter table public.class_documents
  add constraint class_documents_processing_stage_check
  check (processing_stage is null or processing_stage in ('document_ai', 'vision', 'assembling'));

insert into public.ai_function_bindings
  (scope, scope_id, binding_key, provider_id, model_id, reasoning_json)
values
  ('platform', '00000000-0000-4000-8000-000000000001', 'text.document_conversion',
   'google', 'gemini-3.8-flash',
   '{"kind":"google","availableLevels":["low","medium","high"],"thinkingLevel":"medium"}'::jsonb)
on conflict (scope, scope_id, binding_key) do nothing;
