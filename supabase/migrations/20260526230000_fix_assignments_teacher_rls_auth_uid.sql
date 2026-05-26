-- Fix assignments teacher RLS policies: wrap auth.uid() in (select auth.uid())
-- so PostgREST/Supabase evaluates it once per statement (not per row).

drop policy if exists "Teachers can create assignments for their classes"
  on public.assignments;

create policy "Teachers can create assignments for their classes"
  on public.assignments
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.classes
      where
        classes.id = assignments.class_id
        and (
          classes.created_by = (select auth.uid())
          or exists (
            select 1
            from public.class_teachers
            where
              class_teachers.class_id = classes.id
              and class_teachers.teacher_id = (select auth.uid())
          )
        )
    )
  );

drop policy if exists "Teachers can update class assignments"
  on public.assignments;

create policy "Teachers can update class assignments"
  on public.assignments
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.classes
      where
        classes.id = assignments.class_id
        and (
          classes.created_by = (select auth.uid())
          or exists (
            select 1
            from public.class_teachers
            where
              class_teachers.class_id = classes.id
              and class_teachers.teacher_id = (select auth.uid())
          )
        )
    )
  )
  with check (
    exists (
      select 1
      from public.classes
      where
        classes.id = assignments.class_id
        and (
          classes.created_by = (select auth.uid())
          or exists (
            select 1
            from public.class_teachers
            where
              class_teachers.class_id = classes.id
              and class_teachers.teacher_id = (select auth.uid())
          )
        )
    )
  );

drop policy if exists "Teachers can delete class assignments"
  on public.assignments;

create policy "Teachers can delete class assignments"
  on public.assignments
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.classes
      where
        classes.id = assignments.class_id
        and (
          classes.created_by = (select auth.uid())
          or exists (
            select 1
            from public.class_teachers
            where
              class_teachers.class_id = classes.id
              and class_teachers.teacher_id = (select auth.uid())
          )
        )
    )
  );

drop policy if exists "Teachers can view their class assignments"
  on public.assignments;

create policy "Teachers can view their class assignments"
  on public.assignments
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.classes
      where
        classes.id = assignments.class_id
        and (
          classes.created_by = (select auth.uid())
          or exists (
            select 1
            from public.class_teachers
            where
              class_teachers.class_id = classes.id
              and class_teachers.teacher_id = (select auth.uid())
          )
        )
    )
  );
