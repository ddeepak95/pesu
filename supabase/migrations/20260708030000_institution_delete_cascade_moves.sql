-- Allow institutions to be hard-deleted without being blocked by historical
-- class_institution_moves audit rows referencing them as from/to institution.
alter table public.class_institution_moves
  drop constraint class_institution_moves_from_institution_id_fkey,
  add constraint class_institution_moves_from_institution_id_fkey
    foreign key (from_institution_id) references public.institutions(id)
    on delete cascade;

alter table public.class_institution_moves
  drop constraint class_institution_moves_to_institution_id_fkey,
  add constraint class_institution_moves_to_institution_id_fkey
    foreign key (to_institution_id) references public.institutions(id)
    on delete cascade;
