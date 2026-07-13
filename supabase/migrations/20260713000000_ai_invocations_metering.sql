-- AI usage metering — Phase 1 Step 1 (dev-docs/ai-usage-metering-plan.md §4.1-§4.3)
-- Extends ai_invocations into the universal, always-on record for every AI call.

alter table public.ai_invocations
  -- modality discriminator (backfill existing rows to 'text_generation');
  -- vocabulary in plan §4.2 — kept open (text, not enum) for future usage types
  add column if not exists usage_type text not null default 'text_generation',

  -- non-token metrics (null unless the modality applies)
  add column if not exists audio_ms         integer,   -- STT input duration
  add column if not exists characters       integer,   -- TTS input characters
  add column if not exists audio_output_ms  integer,   -- TTS/realtime synthesized audio duration
  add column if not exists session_ms       integer,   -- realtime session length
  add column if not exists metric_source    text,      -- 'provider' | 'measured' | 'estimated'

  -- token-class breakdown for multimodal / cached / reasoning pricing — one
  -- normalized jsonb bag, shape enforced at the application layer (computeUsage.ts)
  add column if not exists token_details    jsonb,

  -- attribution
  add column if not exists institution_id  uuid references public.institutions(id) on delete set null,
  add column if not exists user_id         uuid references auth.users(id) on delete set null,

  -- billing snapshots (computed at write time from the rate card)
  add column if not exists cost_usd        numeric(14,8),   -- backend-only ledger (never shown to customers)
  add column if not exists credits         numeric(14,8),   -- exact, never rounded at write time
  add column if not exists rate_version    text,

  -- provider-side id (when returned) for invoice reconciliation
  add column if not exists provider_request_id text;

-- speech/session rows have no GCS request payload
alter table public.ai_invocations alter column request_storage_path drop not null;

-- backfill institution_id from class_id for existing rows
update public.ai_invocations i
  set institution_id = c.institution_id
  from public.classes c
  where i.class_id = c.id and i.institution_id is null;

-- aggregation / limit-read indexes
create index if not exists ai_invocations_inst_time_idx
  on public.ai_invocations (institution_id, started_at desc) where institution_id is not null;
create index if not exists ai_invocations_inst_type_time_idx
  on public.ai_invocations (institution_id, usage_type, started_at desc) where institution_id is not null;
create index if not exists ai_invocations_class_time_idx
  on public.ai_invocations (class_id, started_at desc) where class_id is not null;

-- RLS: expose reads at three levels (writes stay service-role only, unchanged)
create policy "Usage readable by admins and class teachers" on public.ai_invocations
  for select using (
    public.is_platform_super_admin()
    or (institution_id is not null and public.is_institution_admin(institution_id))
    or (class_id is not null and public.is_class_teacher_admin(class_id))
  );
