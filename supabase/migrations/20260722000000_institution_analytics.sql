-- Institution engagement analytics — on-demand aggregation RPC.
-- See dev-docs/institution-analytics-and-logs-plan.md.
--
-- Egress principle (mirrors ai_usage_counters): aggregate in Postgres, return
-- only the final integers. The heavy scanning over submissions / chat_messages
-- stays inside the DB; ~one small row per class crosses the wire. Invoked lazily
-- from a server action, only when an admin asks to load analytics.
--
-- SECURITY DEFINER because it reads submissions / chat_messages, whose RLS is
-- permissive — so the function itself enforces the admin trust boundary at the
-- top (same rule as the "Admins read app logs" / ai_usage_counters policies).

create or replace function public.institution_class_analytics(
  p_institution_id uuid,
  p_since timestamptz              -- window start for the "recent" counts, e.g. now() - interval '7 days'
)
returns table (
  class_db_id                     uuid,
  class_name                      text,
  class_created_at                timestamptz,
  activities_total                bigint,
  activities_recent               bigint,
  students_total                  bigint,
  students_recent                 bigint,
  conversations_completed_total   bigint,
  conversations_completed_recent  bigint,
  conversations_open_total        bigint,   -- started, not completed
  conversations_open_recent       bigint,
  conversations_total             bigint,   -- completed + open, for avg turns/conversation
  turns_total                     bigint,
  turns_recent                    bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Authorization gate: definer rights would otherwise leak cross-institution
  -- data. Only the platform super admin or an admin of THIS institution may read.
  if not (
    public.is_platform_super_admin()
    or public.is_institution_admin(p_institution_id)
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  return query
  with cls as (
    select c.id, c.name, c.created_at
    from public.classes c
    where c.institution_id = p_institution_id
      and c.status = 'active'
  ),
  act as (
    -- Activities = formative assignments only (excludes learning content etc.).
    select ci.class_id,
           count(*)                                            as total,
           count(*) filter (where ci.created_at >= p_since)    as recent
    from public.content_items ci
    join cls on cls.id = ci.class_id
    where ci.status in ('active', 'draft')
      and ci.type = 'formative_assignment'
    group by ci.class_id
  ),
  stu as (
    select cs.class_id,
           count(*)                                            as total,
           count(*) filter (where cs.joined_at >= p_since)     as recent
    from public.class_students cs
    join cls on cls.id = cs.class_id
    where cs.status = 'active'
    group by cs.class_id
  ),
  subs as (
    -- Conversation = a submission (one student x one activity). Public /
    -- anonymous submissions (student_id null) count; preview runs do not.
    select a.class_id,
           count(*) filter (where s.status = 'completed')                  as completed_total,
           count(*) filter (where s.status = 'completed'
                              and s.created_at >= p_since)                  as completed_recent,
           count(*) filter (where s.status <> 'completed')                 as open_total,
           count(*) filter (where s.status <> 'completed'
                              and s.created_at >= p_since)                  as open_recent,
           count(*)                                                        as convo_total
    from public.submissions s
    join public.assignments a on a.assignment_id = s.assignment_id
    join cls on cls.id = a.class_id
    where coalesce(s.is_preview, false) = false
    group by a.class_id
  ),
  turns as (
    -- Turn = any chat_messages row (student + assistant), excluding preview subs.
    select a.class_id,
           count(*)                                            as total,
           count(*) filter (where m.created_at >= p_since)     as recent
    from public.chat_messages m
    join public.assignments a on a.assignment_id = m.assignment_id
    join cls on cls.id = a.class_id
    join public.submissions s on s.submission_id = m.submission_id
    where coalesce(s.is_preview, false) = false
    group by a.class_id
  )
  select
    cls.id,
    cls.name,
    cls.created_at,
    coalesce(act.total, 0),   coalesce(act.recent, 0),
    coalesce(stu.total, 0),   coalesce(stu.recent, 0),
    coalesce(subs.completed_total, 0), coalesce(subs.completed_recent, 0),
    coalesce(subs.open_total, 0),      coalesce(subs.open_recent, 0),
    coalesce(subs.convo_total, 0),
    coalesce(turns.total, 0), coalesce(turns.recent, 0)
  from cls
  left join act   on act.class_id   = cls.id
  left join stu   on stu.class_id   = cls.id
  left join subs  on subs.class_id  = cls.id
  left join turns on turns.class_id = cls.id
  order by cls.name;
end;
$$;

-- Postgres grants EXECUTE to PUBLIC by default, so named-role revokes alone
-- don't restrict anything — revoke from PUBLIC/anon too, then grant explicitly.
revoke all on function public.institution_class_analytics(uuid, timestamptz)
  from public, anon;
grant execute on function public.institution_class_analytics(uuid, timestamptz)
  to authenticated, service_role;

-- Supporting index for the heaviest scan (turns rollup over chat_messages,
-- all roles, narrowed by created_at for the recent window). Named distinctly so
-- `if not exists` is a genuine no-op if an equivalent already exists remotely.
create index if not exists chat_messages_assignment_created_idx
  on public.chat_messages (assignment_id, created_at);
