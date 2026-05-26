drop policy if exists "Allow authenticated users to read assignments"
on public.assignments;

create policy "Allow authenticated users to read assignments"
on public.assignments
for select
to authenticated
using (
  status = 'active'::text
  and (
    is_public = true
    or exists (
      select 1
      from public.classes
      where
        classes.id = assignments.class_id
        and classes.created_by = (select auth.uid())
    )
    or exists (
      select 1
      from public.class_teachers
      where
        class_teachers.class_id = assignments.class_id
        and class_teachers.teacher_id = (select auth.uid())
    )
  )
);