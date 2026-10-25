create table public.class_documents (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  title text not null,
  filename text not null,
  file_size integer not null check (file_size > 0 and file_size <= 20971520),
  page_count integer,
  original_path text not null,
  markdown_path text,
  markdown text not null default '',
  status text not null default 'uploading' check (status in ('uploading','processing','review','ready','failed')),
  operation_name text,
  error_message text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search_vector tsvector generated always as (to_tsvector('simple', title || ' ' || markdown)) stored
);
create index class_documents_class_status_idx on public.class_documents(class_id, status, created_at desc);
create index class_documents_search_idx on public.class_documents using gin(search_vector);

create table public.class_document_figures (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.class_documents(id) on delete cascade,
  page_number integer not null,
  figure_order integer not null,
  storage_path text not null,
  description text not null default '',
  selected boolean not null default true,
  unique(document_id, page_number, figure_order)
);

create table public.class_document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.class_documents(id) on delete cascade,
  chunk_order integer not null,
  page_number integer not null,
  heading text,
  content text not null,
  unique(document_id, chunk_order)
);
create index class_document_chunks_document_idx on public.class_document_chunks(document_id, chunk_order);

create table public.assignment_documents (
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  document_id uuid not null references public.class_documents(id) on delete restrict,
  position integer not null default 0,
  primary key(assignment_id, document_id)
);
create index assignment_documents_document_idx on public.assignment_documents(document_id);

create function public.class_document_teacher(p_class_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.class_teachers
    where class_id = p_class_id and teacher_id = (select auth.uid()));
$$;

alter table public.class_documents enable row level security;
alter table public.class_document_figures enable row level security;
alter table public.class_document_chunks enable row level security;
alter table public.assignment_documents enable row level security;

create policy "Class teachers read documents" on public.class_documents for select to authenticated
  using (public.class_document_teacher(class_id));

create policy "Class teachers read figures" on public.class_document_figures for select to authenticated
  using (exists(select 1 from public.class_documents d where d.id = document_id and public.class_document_teacher(d.class_id)));
create policy "Class teachers read chunks" on public.class_document_chunks for select to authenticated
  using (exists(select 1 from public.class_documents d where d.id = document_id and public.class_document_teacher(d.class_id)));
create policy "Class teachers read attachments" on public.assignment_documents for select to authenticated
  using (exists(select 1 from public.assignments a where a.id = public.assignment_documents.assignment_id and public.class_document_teacher(a.class_id)));
revoke all on public.class_documents, public.class_document_figures, public.class_document_chunks, public.assignment_documents from anon, authenticated;
grant select on public.class_documents to authenticated;
grant select on public.class_document_figures, public.class_document_chunks to authenticated;
grant select on public.assignment_documents to authenticated;

create function public.replace_assignment_documents(p_assignment_id uuid, p_document_ids uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare v_class_id uuid;
begin
  select class_id into v_class_id from public.assignments where id = p_assignment_id;
  if v_class_id is null or not public.class_document_teacher(v_class_id) then
    raise exception 'Assignment not found';
  end if;
  if exists(select 1 from unnest(p_document_ids) as selected(id)
    where not exists(select 1 from public.class_documents d
      where d.id = selected.id and d.class_id = v_class_id
      and (d.status = 'ready' or exists(select 1 from public.assignment_documents ad
        where ad.assignment_id = p_assignment_id and ad.document_id = d.id)))) then
    raise exception 'Document unavailable for this class';
  end if;
  delete from public.assignment_documents where assignment_id = p_assignment_id;
  insert into public.assignment_documents(assignment_id, document_id, position)
    select p_assignment_id, id, ordinality - 1 from unnest(p_document_ids) with ordinality as x(id, ordinality)
    on conflict do nothing;
end;
$$;
revoke all on function public.replace_assignment_documents(uuid, uuid[]) from public;
grant execute on function public.replace_assignment_documents(uuid, uuid[]) to authenticated;
