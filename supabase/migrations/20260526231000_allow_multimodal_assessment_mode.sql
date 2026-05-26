-- App supports multimodal assignments; extend check constraint to match.

alter table public.assignments
  drop constraint if exists assignments_assessment_mode_check;

alter table public.assignments
  add constraint assignments_assessment_mode_check
  check (
    assessment_mode = any (
      array[
        'voice'::text,
        'text_chat'::text,
        'static_text'::text,
        'multimodal'::text
      ]
    )
  );
