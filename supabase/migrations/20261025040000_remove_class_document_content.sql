-- Apply only after the GCS backfill has verified all legacy document content.
do $$
begin
  if exists (
    select 1 from public.class_documents
    where (markdown <> '' and draft_path is null)
      or (status = 'ready' and approved_path is null)
      or (status = 'review' and draft_path is null)
  ) then
    raise exception 'Class document GCS backfill is incomplete';
  end if;
end;
$$;

drop table public.class_document_chunks;
drop table public.class_document_figures;
alter table public.class_documents
  drop column search_vector,
  drop column markdown,
  drop column markdown_path;
