-- The separate Gemini PDF reconstruction step has been removed. Keep the
-- previously applied conversion-progress migration intact and retire its binding.
delete from public.ai_function_bindings
where binding_key = 'text.document_conversion';

alter table public.class_documents
  drop constraint class_documents_processing_stage_check,
  add constraint class_documents_processing_stage_check
    check (processing_stage is null or processing_stage in ('document_ai', 'assembling'));
