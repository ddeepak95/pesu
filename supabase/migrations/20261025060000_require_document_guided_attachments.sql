-- Keep the document requirement authoritative even if a client bypasses the editor.
create function public.require_document_guided_attachment() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.activity_template_id = '11111111-1111-4111-8111-000000000005'::uuid
     and new.status = 'active'
     and not exists (
       select 1 from public.assignment_documents ad
       join public.class_documents d on d.id = ad.document_id
       where ad.assignment_id = new.id and d.approved_path is not null
     ) then
    raise exception 'Document-guided activities require an approved attached document';
  end if;
  return new;
end;
$$;

create trigger assignments_require_document_guided_attachment
before insert or update of status, activity_template_id on public.assignments
for each row execute function public.require_document_guided_attachment();

create or replace function public.replace_assignment_documents(p_assignment_id uuid, p_document_ids uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare v_class_id uuid; v_template_id uuid; v_status text;
begin
  select class_id, activity_template_id, status into v_class_id, v_template_id, v_status
  from public.assignments where id = p_assignment_id;
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
  if v_template_id = '11111111-1111-4111-8111-000000000005'::uuid and v_status = 'active'
     and not exists(select 1 from unnest(p_document_ids) as selected(id)
       join public.class_documents d on d.id = selected.id
       where d.approved_path is not null) then
    raise exception 'Document-guided activities require an approved attached document';
  end if;
  delete from public.assignment_documents where assignment_id = p_assignment_id;
  insert into public.assignment_documents(assignment_id, document_id, position)
    select p_assignment_id, id, ordinality - 1 from unnest(p_document_ids) with ordinality as x(id, ordinality)
    on conflict do nothing;
end;
$$;
