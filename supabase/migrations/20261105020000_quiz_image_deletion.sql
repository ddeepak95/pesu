alter table public.quiz_images drop constraint quiz_images_status_check;
alter table public.quiz_images add constraint quiz_images_status_check
  check (status in ('pending', 'ready', 'deleting'));

-- Serialize attaching an image with claiming it for deletion. The FK alone
-- would prevent deleting metadata, but not deleting the GCS object first.
create function public.guard_quiz_image_reference() returns trigger
language plpgsql security definer set search_path = public as $$
declare asset_status text;
begin
  select status into asset_status from public.quiz_images where id = new.image_id for update;
  if asset_status is distinct from 'ready' then
    raise exception 'Question image is unavailable or being deleted' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_quiz_image_reference() from public;
create trigger guard_quiz_image_reference before insert or update on public.quiz_image_references
for each row execute function public.guard_quiz_image_reference();

-- Server-only: the route authenticates the class teacher before calling.
-- Keep metadata in 'deleting' after GCS failures so a UI retry can finish.
create function public.claim_quiz_image_deletion(p_class_id uuid, p_image_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare asset public.quiz_images;
begin
  select * into asset from public.quiz_images where id = p_image_id and class_id = p_class_id for update;
  if not found then return null; end if;
  if asset.status not in ('ready', 'deleting') then
    raise exception 'Image upload has not finished' using errcode = '23514';
  end if;
  if exists(select 1 from public.quiz_image_references where image_id = p_image_id) then
    raise exception 'This image is still used by a saved quiz. Remove it and save every quiz using it before deleting.' using errcode = '23503';
  end if;
  update public.quiz_images set status = 'deleting' where id = p_image_id;
  return asset.storage_path;
end;
$$;
revoke all on function public.claim_quiz_image_deletion(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_quiz_image_deletion(uuid, uuid) to service_role;
