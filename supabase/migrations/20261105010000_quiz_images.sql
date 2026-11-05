-- Assets stay private in GCS. Clients cannot mutate metadata or grant references.
create function public.quiz_image_teacher(p_class_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.classes c where c.id = p_class_id and
    (c.created_by = auth.uid() or exists(select 1 from public.class_teachers t
      where t.class_id = c.id and t.teacher_id = auth.uid())));
$$;
revoke all on function public.quiz_image_teacher(uuid) from public;
grant execute on function public.quiz_image_teacher(uuid) to authenticated, service_role;

create table public.quiz_images (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  filename text not null,
  mime_type text not null check (mime_type in ('image/png','image/jpeg','image/webp')),
  file_size integer not null check (file_size > 0 and file_size <= 10485760),
  storage_path text not null unique,
  status text not null default 'pending' check (status in ('pending','ready')),
  created_at timestamptz not null default now()
);
create table public.quiz_image_references (
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  image_id uuid not null references public.quiz_images(id),
  primary key (quiz_id, image_id)
);
create index quiz_image_references_image_idx on public.quiz_image_references(image_id);
create index quiz_images_cleanup_idx on public.quiz_images(class_id, created_at) where status = 'pending';
alter table public.quiz_images enable row level security;
alter table public.quiz_image_references enable row level security;
revoke all on public.quiz_images, public.quiz_image_references from anon, authenticated;
grant all on public.quiz_images, public.quiz_image_references to service_role;

-- Runs in the same transaction as quiz writes, including existing copy flows.
create function public.sync_quiz_image_references() returns trigger
language plpgsql security definer set search_path = public as $$
declare asset_id uuid; asset_ids uuid[] := '{}';
begin
  for asset_id in
    select distinct (m)[1]::uuid
    from jsonb_array_elements(new.questions) q,
      lateral regexp_matches(q->>'prompt', '/api/quizzes/images/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})', 'g') m
    where q->>'prompt_format' = 'markdown'
  loop
    if not exists (
      select 1 from public.quiz_images i where i.id = asset_id and i.status = 'ready' and (
        public.quiz_image_teacher(i.class_id)
        or exists (select 1 from public.quiz_image_references r join public.quizzes source on source.id = r.quiz_id
          where r.image_id = i.id and source.status in ('active','draft') and public.quiz_image_teacher(source.class_id))
        or auth.role() = 'service_role'
      )
    ) then
      raise exception 'Question image is unavailable or unauthorized' using errcode = '42501';
    end if;
    asset_ids := array_append(asset_ids, asset_id);
  end loop;
  delete from public.quiz_image_references where quiz_id = new.id and not (image_id = any(asset_ids));
  insert into public.quiz_image_references(quiz_id, image_id)
    select new.id, unnest(asset_ids) on conflict do nothing;
  return new;
end;
$$;
revoke all on function public.sync_quiz_image_references() from public;
create trigger sync_quiz_image_references after insert or update of questions on public.quizzes
for each row execute function public.sync_quiz_image_references();
