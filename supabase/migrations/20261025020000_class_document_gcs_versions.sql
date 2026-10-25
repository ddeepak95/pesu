-- Content and figure metadata are stored in immutable GCS artifacts.
-- Keep legacy columns/tables until existing documents have been exported and verified.
alter table public.class_documents
  add column if not exists draft_path text,
  add column if not exists approved_path text,
  add column if not exists tags text[] not null default '{}',
  add column if not exists metadata_search tsvector not null default ''::tsvector;

create function public.update_class_document_metadata_search() returns trigger
language plpgsql as $$
begin
  new.metadata_search := to_tsvector('simple', new.title || ' ' || array_to_string(new.tags, ' '));
  return new;
end;
$$;
create trigger class_document_metadata_search before insert or update of title, tags
  on public.class_documents for each row execute function public.update_class_document_metadata_search();
update public.class_documents set metadata_search = to_tsvector('simple', title || ' ' || array_to_string(tags, ' '));

create index if not exists class_documents_title_search_idx
  on public.class_documents using gin (metadata_search);

comment on column public.class_documents.draft_path is 'GCS prefix for the current unapproved Markdown and index';
comment on column public.class_documents.approved_path is 'GCS prefix for the immutable approved Markdown and index';
