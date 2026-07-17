# Institution Analytics & Logs — Plan

Status: **Proposed** (2026-07-17)
Owner: platform / institution admin surface
Branch target: `usage-metering` (or a follow-up branch)

## 1. Goal & scope

The **Analytics and Logs** tab on the institution detail view
([`InstitutionDetailView.tsx`](../src/components/Platform/InstitutionDetailView.tsx),
`TabsContent value="analytics"`) currently renders only `UsageOverview` (AI
credits/requests by month + funding history). This plan adds two things,
institution-scoped, to that same tab:

1. **App logs pertaining to the institution** — surface the existing,
   already-RLS-scoped `app_logs` feed inline in the tab (table + filter bar).
2. **Engagement analytics** — all-time **and** last-7-days counts:
   - classes added (institution level)
   - per class: activities, students, conversations completed, conversations
     started-but-not-completed, and turn totals/averages across conversations.

The tab is shared by both admin surfaces:
- `/platform/institutions/[id]` — super admin (`viewerRole="super_admin"`)
- `/admin/institutions/[id]` — institution admin (`viewerRole="institution_admin"`)

Both load props through the same server component
([`admin/institutions/[id]/page.tsx`](../src/app/admin/institutions/[id]/page.tsx)
and its `platform/` twin) → `InstitutionDetailView`.

### Design decisions (confirmed)

| Question | Decision |
| --- | --- |
| What is a "conversation"? | **A `submissions` row** (one student × one activity). It has a clean `status` (`in_progress` / `completed`), so "completed" vs "started-but-not-completed" is unambiguous. Attempt-session granularity was considered and rejected — sessions have no explicit done flag. |
| "Turns in each conversation" presentation | **Aggregate per class** — total turns + average turns per conversation. No per-conversation listing (avoids hundreds/thousands of rows and the egress that implies). A drill-down can be added later if asked. |
| App logs in the tab | **Embed** `AppLogsTable` + `AppLogsFilterBar` inline, institution-scoped, **recent 20 rows** (loaded eagerly — trivial egress). The standalone `/logs` page stays the deep-filter/pagination surface. |
| Aggregation architecture | **On-demand `SECURITY DEFINER` RPC** returning only aggregated numbers. No new rollup table, no cron, zero staleness. See §4. |
| Engagement analytics loading | **Lazy — fetched only when the user asks.** The per-class engagement table does **not** run on page landing; a "Load analytics" action triggers the RPC via a server action (mirrors `UsageOverview`'s `getUsageForMonthAction` pattern). Keeps the heaviest scan (turns over `chat_messages`) off the default render path. |

## 2. What already exists (reuse, don't rebuild)

- **`app_logs`** table + institution-scoped RLS ("Admins read app logs"),
  `listAppLogs(supabase, { institutionId, level, source, limit })`
  ([`src/lib/queries/appLogs.ts`](../src/lib/queries/appLogs.ts)),
  `AppLogsTable`, `AppLogsFilterBar`, and a full standalone page at
  [`/admin/institutions/[id]/logs`](../src/app/admin/institutions/[id]/logs/page.tsx).
  The logs half of this work is **surfacing**, not new plumbing.
- **`ai_usage_counters`** — the precedent for "aggregate in Postgres, return
  only numbers." We follow the same *principle* (SQL-side aggregation, tiny
  egress) but not the same *mechanism* (see §4 for why no rollup table).
- **RLS helpers** already in the DB and used by `app_logs` / `ai_usage_counters`
  policies: `public.is_platform_super_admin()`,
  `public.is_institution_admin(uuid)`, `public.is_class_teacher_admin(uuid)`.

## 3. Metric definitions & data-model mapping

All counts come in two flavors: **all-time** and **last 7 days** (rolling window
`created_at >= now() - interval '7 days'`; the RPC takes an explicit `p_since`
so the window is caller-controlled and testable).

### Join spine

```
classes (institution_id, status, created_at)
  └─ assignments (class_id)            -- assignments.class_id is a direct uuid FK
       └─ submissions (assignment_id)  -- submissions.assignment_id → assignments.assignment_id (text)
            └─ chat_messages (assignment_id, submission_id, role, created_at)
class_students (class_id, status, joined_at)
content_items (class_id, type, status)
```

`assignments.class_id` (verified in
[`assignmentClassCache.ts`](../src/lib/assignments/assignmentClassCache.ts)) makes
every rollup a **single hop** to a class. `chat_messages` also carries
`assignment_id`, so turns roll up to a class without touching `submissions`.

### Per metric

| Metric | Source & rule |
| --- | --- |
| **Classes added** | `classes` where `institution_id = :inst` and `status = 'active'` (exclude `archived`). All-time = count; last-week = `count(*) filter (created_at >= :since)`. |
| **Activities per class** | `content_items` where `class_id = C`, `status in ('active','draft')`, **and `type = 'formative_assignment'`** — formative assignments only (learning content and other content-item types are excluded). |
| **Students per class** | `class_students` where `class_id = C` and `status = 'active'`. Last-week uses `joined_at`. |
| **Conversations completed / class** | `submissions` where class = C, `status = 'completed'`, `is_preview` not true. |
| **Conversations started-not-completed / class** | `submissions` where class = C, `status <> 'completed'` (i.e. `in_progress`), `is_preview` not true. Optionally require `has_attempts = true` to exclude opened-but-never-answered shells (open question O2). |
| **Turns — total & avg / class** | A **turn = one `chat_messages` row of any `role`** (student + assistant messages both count). `total_turns` = count; `avg_turns_per_conversation` = `total_turns / NULLIF(total_conversations, 0)`, computed in SQL. Exclude turns whose submission `is_preview = true`. |

Time basis for the last-week window: `created_at` for classes / submissions /
chat_messages / content_items; `joined_at` for students.

## 4. Architecture — on-demand RPC (egress rationale)

**Chosen: a `SECURITY DEFINER` Postgres function that aggregates and returns one
small result set, invoked lazily via a server action only when the user asks for
it.** Rationale:

- **Egress** is bytes leaving the DB. Counting rows in the app would stream
  thousands of `submissions` / `chat_messages` rows out just to `.length` them —
  the exact anti-pattern to avoid. Aggregating in SQL means **only the final
  integers cross the wire** (a few dozen rows: one per class + one institution
  summary). This is identical in egress terms to a precomputed rollup table.
- **No rollup table / cron** because the **"last 7 days" window is rolling** —
  a materialized snapshot would need continuous refresh to stay correct, adding
  staleness and pg_cron infrastructure for no egress benefit. The counts are
  scoped to a single institution over indexed columns; on-demand aggregation is
  cheap and always fresh.
- **Lazy invocation** — because the RPC (and its `chat_messages` scan) never
  runs on page landing, a visitor who only opens the tab for logs or AI-credit
  usage pays nothing for engagement analytics. The scan happens once, on the
  explicit "Load analytics" click, per the loading decision in §1.
- **Escape hatch:** if turns aggregation over `chat_messages` proves slow at
  scale for a large institution, promote *only that metric* to a nightly rollup
  (following the `ai_usage_counters` pattern) while keeping the rest on-demand.
  Not needed for v1.

### The RPC

One function returns per-class rows; the institution-level "classes added"
number is derived by the caller (or returned as a separate summary row).

```sql
-- supabase/migrations/<ts>_institution_analytics.sql
create or replace function public.institution_class_analytics(
  p_institution_id uuid,
  p_since timestamptz            -- e.g. now() - interval '7 days'
)
returns table (
  class_db_id                uuid,
  class_name                 text,
  activities_total           bigint,
  activities_recent          bigint,
  students_total             bigint,
  students_recent            bigint,
  conversations_completed_total   bigint,
  conversations_completed_recent  bigint,
  conversations_open_total        bigint,   -- started, not completed
  conversations_open_recent       bigint,
  turns_total                bigint,
  turns_recent               bigint,
  conversations_total        bigint         -- for avg = turns_total / conversations_total
)
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Authorization gate: this function reads across permissive-RLS tables
  -- (submissions, chat_messages), so it must enforce the same access rule the
  -- app_logs / ai_usage_counters policies use.
  if not (public.is_platform_super_admin()
          or public.is_institution_admin(p_institution_id)) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  return query
  with cls as (
    select c.id, c.name
    from public.classes c
    where c.institution_id = p_institution_id
      and c.status = 'active'
  ),
  act as (
    select ci.class_id,
           count(*) as total,
           count(*) filter (where ci.created_at >= p_since) as recent
    from public.content_items ci
    join cls on cls.id = ci.class_id
    where ci.status in ('active','draft')
      and ci.type = 'formative_assignment'
    group by ci.class_id
  ),
  stu as (
    select cs.class_id,
           count(*) as total,
           count(*) filter (where cs.joined_at >= p_since) as recent
    from public.class_students cs
    join cls on cls.id = cs.class_id
    where cs.status = 'active'
    group by cs.class_id
  ),
  subs as (
    select a.class_id,
           count(*) filter (where s.status = 'completed') as completed_total,
           count(*) filter (where s.status = 'completed'
                              and s.created_at >= p_since) as completed_recent,
           count(*) filter (where s.status <> 'completed') as open_total,
           count(*) filter (where s.status <> 'completed'
                              and s.created_at >= p_since) as open_recent,
           count(*) as convo_total
    from public.submissions s
    join public.assignments a on a.assignment_id = s.assignment_id
    join cls on cls.id = a.class_id
    where coalesce(s.is_preview, false) = false
    group by a.class_id
  ),
  turns as (
    select a.class_id,
           count(*) as total,
           count(*) filter (where m.created_at >= p_since) as recent
    from public.chat_messages m
    join public.assignments a on a.assignment_id = m.assignment_id
    join cls on cls.id = a.class_id
    join public.submissions s on s.submission_id = m.submission_id
    where coalesce(s.is_preview, false) = false   -- all roles count as turns
    group by a.class_id
  )
  select cls.id, cls.name,
         coalesce(act.total,0),  coalesce(act.recent,0),
         coalesce(stu.total,0),  coalesce(stu.recent,0),
         coalesce(subs.completed_total,0), coalesce(subs.completed_recent,0),
         coalesce(subs.open_total,0),      coalesce(subs.open_recent,0),
         coalesce(turns.total,0), coalesce(turns.recent,0),
         coalesce(subs.convo_total,0)
  from cls
  left join act   on act.class_id   = cls.id
  left join stu   on stu.class_id   = cls.id
  left join subs  on subs.class_id  = cls.id
  left join turns on turns.class_id = cls.id
  order by cls.name;
end;
$$;

revoke all on function public.institution_class_analytics(uuid, timestamptz)
  from public, anon;
grant execute on function public.institution_class_analytics(uuid, timestamptz)
  to authenticated, service_role;
```

Notes:
- **Two windows in one pass**: each CTE returns `total` + `..._recent` via
  `count(*) filter (where created_at >= p_since)`. One round trip, no second
  query for "last week."
- **Classes added (institution level)**: derive in the caller as
  `rows.length` for all-time and `count(row.created_at >= since)` — or add a
  `class_created_recent boolean`/`class_created_at` column to the returned rows
  so the caller sums it without a second query. (Recommended: return
  `class_created_at` so the classes-added-last-week number is exact.)
- **`avg_turns_per_conversation`** is computed client/server-side from
  `turns_total / conversations_total` to keep the SQL simple, or add it as a
  numeric column with `NULLIF` guard.

### Indexes (verify before adding — some may exist)

- `assignments (class_id)` — join key for subs/turns rollups.
- `submissions (assignment_id)` — likely exists; verify.
- `chat_messages (assignment_id, created_at)` — the turns rollup is the heaviest
  scan (all roles, filtered by `created_at` for the recent window); ensure an
  index supports it.
- `content_items (class_id, status)`, `class_students (class_id, status)`,
  `classes (institution_id, status)` — likely present; verify.

Add only the missing ones in the same migration.

## 5. Server / query layer (TypeScript)

New file `src/lib/queries/institutionAnalytics.ts`:

```ts
export interface ClassAnalyticsRow {
  classDbId: string;
  className: string;
  activities: { total: number; recent: number };
  students: { total: number; recent: number };
  conversationsCompleted: { total: number; recent: number };
  conversationsOpen: { total: number; recent: number };
  turns: { total: number; recent: number };
  conversationsTotal: number;          // for avg
  avgTurnsPerConversation: number;     // derived
}

export interface InstitutionAnalytics {
  classesAdded: { total: number; recent: number };
  classes: ClassAnalyticsRow[];
}

export async function getInstitutionAnalytics(
  supabase: SupabaseClient,
  institutionId: string,
  sinceIso: string,               // now() - 7d, computed by caller
): Promise<InstitutionAnalytics>;   // single supabase.rpc('institution_class_analytics', ...)
```

- Uses the **caller's RLS-scoped client** (the RPC re-checks authorization
  internally, matching the `app_logs` convention).
- `sinceIso` computed server-side (`new Date(Date.now() - 7*864e5).toISOString()`)
  so the window is deterministic per request.

### Server action (lazy entry point)

The engagement analytics is **not** called from the page loader. Instead, a
server action wraps `getInstitutionAnalytics` and is invoked from the client on
demand — same shape as `getUsageForMonthAction`
([`src/lib/ai/metering/actions.ts`](../src/lib/ai/metering/actions.ts)):

```ts
// src/lib/ai/analytics/actions.ts (or alongside existing metering actions)
"use server";
export async function getInstitutionAnalyticsAction(input: {
  institutionId: string;
}): Promise<
  | { ok: true; analytics: InstitutionAnalytics }
  | { ok: false; error: string }
> {
  const { supabase } = await requireInstitutionAdminOrSuper(input.institutionId);
  const sinceIso = new Date(Date.now() - 7 * 864e5).toISOString();
  const analytics = await getInstitutionAnalytics(supabase, input.institutionId, sinceIso);
  return { ok: true, analytics };
}
```

The action re-runs the same `requireInstitutionAdminOrSuper` gate the page
loader uses, so the lazy path is authorized independently of the initial render.

## 6. UI

Extend the analytics tab in
[`InstitutionDetailView.tsx`](../src/components/Platform/InstitutionDetailView.tsx#L324-L330).
New props on `InstitutionDetailViewProps`, populated by both page loaders. Note
**`analytics` is deliberately absent** from the loader — it arrives via the
server action on click, not as a page prop:

- `institutionId: string` (already available)
- `appLogs: AppLogRow[]` (recent **20**, institution-scoped)
- current `level` / `source` filter values (from `searchParams`)

Tab layout (top → bottom):

1. **Existing** `UsageOverview` (unchanged).
2. **Engagement summary** — a new `InstitutionAnalyticsSection` (client component):
   - Initial state: a placeholder card with a **"Load analytics"** button and one
     line of copy ("Engagement counts are computed on demand"). Nothing fetched
     yet.
   - On click: `useTransition` + `getInstitutionAnalyticsAction({ institutionId })`,
     show a spinner while pending, then render the results (and cache in
     `useState` so re-opening the tab doesn't re-fetch). A "Refresh" affordance
     re-runs the action.
   - Rendered results: a small stat row *Classes added* (all-time / last 7 days),
     then a per-class table — columns Class · Activities · Students · Completed ·
     In progress · Turns (total) · Avg turns/convo, each cell showing `total`
     with a muted `+recent` last-week delta. Reuse the bordered-table styling
     from `AdminsCard` / `RecentMovesSection`.
   - Build as reusable presentational components (`ui/` table shell + a feature
     composer) per the modular-components preference — not inlined.
3. **Logs** — `AppLogsFilterBar` + `AppLogsTable`, institution-scoped, **recent
   20 rows**, mirroring the standalone page but embedded. Filter state via
   `?level=&source=` on the tab URL (the tab already round-trips `?tab=analytics`;
   add the log filter params alongside). Keep a "View all logs →" link to the
   dedicated page for deep filtering/pagination beyond the 20-row slice.

### Server component wiring

In both `admin/.../[id]/page.tsx` and `platform/.../[id]/page.tsx`, add **only**
the logs read to the `Promise.all` (analytics is lazy, so it is *not* fetched
here):
- `listAppLogs(supabase, { institutionId: id, level, source, limit: 20 })`

Read `level` / `source` from `searchParams` (both pages already accept
`searchParams`). Pass the logs + `level`/`source` into `InstitutionDetailView`;
the analytics section fetches itself on demand via the server action.

## 7. Security & RLS

- **App logs**: unchanged — the existing "Admins read app logs" policy scopes
  rows to the viewer's institution (super admin: all). The embedded table
  inherits it because we query through the caller's client.
- **Analytics RPC**: `SECURITY DEFINER` (needs to read `submissions` /
  `chat_messages`, whose RLS is permissive) **with an explicit
  `is_platform_super_admin() OR is_institution_admin(p_institution_id)` gate at
  the top** — same trust boundary as the two existing admin-only reads. Without
  the gate, definer rights would leak cross-institution data. `EXECUTE` revoked
  from `anon`.
- **Server action**: the lazy entry point re-runs `requireInstitutionAdminOrSuper`
  before calling the RPC, so authorization does not depend on the initial page
  render — a defense-in-depth double gate (action check + RPC internal check).

## 8. Egress analysis

- **Analytics**: **zero cost until the user clicks "Load analytics."** When
  invoked, one RPC call → ~`(#classes + 1)` rows of integers. For an institution
  with 50 classes that's ~50 short rows regardless of how many
  submissions/messages underlie them. The heavy scanning stays inside Postgres;
  nothing but counts leaves the DB, and the result is cached client-side so a
  second look doesn't re-fetch.
- **Logs**: bounded `limit` (**20**) of already-lean rows, loaded once per page
  render.
- **No polling / no client-side aggregation.** Logs load once server-side;
  analytics loads once, lazily, on explicit request.

## 9. Edge cases

- **Preview submissions** (`is_preview = true`) excluded from conversation and
  turn counts (teacher "Save and Preview" runs).
- **Public / anonymous submissions** (`student_id` null) — currently **counted**
  as conversations (they're real engagement). Flag if institution analytics
  should be authenticated-students-only (open question O4).
- **Archived classes** excluded (`status = 'active'`). Their historical
  submissions/turns therefore drop out of totals — acceptable for an "active
  institution" view; note it in the UI copy if needed.
- **Class with zero activity** still appears (LEFT JOINs + `coalesce(...,0)`).
- **Division by zero** for avg turns guarded by `NULLIF(conversations_total,0)`.
- **Time zone**: `p_since` is a `timestamptz`; comparisons are TZ-safe. Match
  `ai_usage_counters`' UTC convention if a day-boundary metric is added later.

## 10. Implementation phases

1. **Migration** — `institution_class_analytics` RPC + any missing indexes.
   Verify against local/remote schema which indexes already exist.
2. **Query layer + server action** — `src/lib/queries/institutionAnalytics.ts`
   + types, and `getInstitutionAnalyticsAction` (lazy entry point with its own
   `requireInstitutionAdminOrSuper` gate).
3. **UI components** — `InstitutionAnalyticsSection` (placeholder → "Load
   analytics" button → `useTransition` fetch → stat row + per-class table,
   result cached in state), reusing existing table styling; wire the embedded
   logs table (limit 20).
4. **Props & loaders** — extend `InstitutionDetailViewProps` (logs + filter
   values only, no analytics prop); update both `admin` and `platform`
   institution page loaders (`Promise.all` + searchParams).
5. **Verify** — drive the tab as both a super admin and an institution admin;
   confirm the analytics table stays empty until clicked, cross-institution
   isolation (an institution admin sees only their institution's classes/logs),
   last-week deltas, and preview exclusion.

## 11. Resolved definitions

All resolved (2026-07-17):

- **O1 → Formative assignments only.** Activities per class counts
  `content_items` with `type = 'formative_assignment'` (excludes learning
  content and other types).
- **O2 → All non-completed.** Started-but-not-completed includes
  opened-but-never-answered shells (`status <> 'completed'`, no `has_attempts`
  requirement).
- **O3 → All messages.** A turn is any `chat_messages` row regardless of role
  (student + assistant).
- **O4 → Yes.** Public/anonymous submissions (`student_id` null) count as
  conversations.
- **O5 → Fixed 7-day window.** No range picker in v1; the RPC's `p_since` param
  keeps a future picker a UI-only change.
```