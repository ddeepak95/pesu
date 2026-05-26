-- Align submission_mode check with assignment assessment_mode (includes multimodal).

alter table public.submissions
  drop constraint if exists submissions_submission_mode_check;

alter table public.submissions
  add constraint submissions_submission_mode_check
  check (
    submission_mode = any (
      array[
        'voice'::text,
        'text_chat'::text,
        'static_text'::text,
        'mixed'::text,
        'multimodal'::text
      ]
    )
  );
