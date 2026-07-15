# Phase 3 — AI Usage Metering: Wallets + Enforcement

Companion implementation plan for `dev-docs/ai-usage-metering-plan.md` §4.6,
§7.1, §8, and §9 point 3. That doc remains the source of truth for the
*original* wallet design (three-table schema, rollover formula,
`assertWithinQuota` read path) — this file **revises** that design with a
set of product decisions made after the original plan was written (see
"Revision history" below), and is the concrete, sequenced implementation
plan. Every file:line reference below was verified against the real Phase
1/2 code on `usage-metering` this session, not derived from prose alone.

## Revision history

The following decisions were made in conversation and **change** the
original main-plan design, not just add detail to it:

1. **No automatic monthly refill in this phase.** `monthly_grant` stays as
   a schema field and `grant_monthly_credits` stays as a callable function
   (so a cron can be wired up later with zero schema change), but no
   `pg_cron` job is scheduled. Funding is manual/admin-driven only, this
   phase.
2. **Funding is hierarchical and permissioned, not "anyone tops up
   anything."** Super admins can fund any institution or class wallet.
   Institution admins can fund wallets for classes in their own
   institution, and — only when a super admin has explicitly opted their
   institution in — their own institution's **BYOK** wallet.
3. **Class funding is bounded by a declared institution capacity ceiling,
   not a real balance transfer.** An institution wallet gets a
   `class_allocation_capacity` (nullable — `null` = unbounded). Allocating
   credits to a class wallet is checked against this ceiling; the
   institution's own balance is untouched by the act of allocating (it's a
   cap check, not money moving from one wallet to another).
4. **BYOK institutions can be granted self-service.** A `self_manage_enabled`
   flag on an institution's BYOK wallet, settable only by a super admin
   (locked field, same idiom as `ai_institution_settings.allow_admin_edit`),
   lets that institution's own admin fund/configure their BYOK wallet
   without going through a super admin — because BYOK spend is the
   institution's own money on their own provider key, not a platform
   resource.
5. **Every wallet-affecting change is audited.** Credit additions are
   already covered by the existing `ai_credit_transactions` ledger; a new
   `ai_credit_wallet_policy_audit` table captures every change to a
   wallet's policy fields (enforcement, caps, `self_manage_enabled`) as a
   before/after snapshot, written automatically by a DB trigger.
6. **This phase is UI-driven; the write functions are built to be
   API-ready later.** No public REST endpoint ships this phase for
   funding/policy actions — an admin UI calls Postgres RPCs directly
   through the user's own authenticated session (not service-role). A
   future public API route is a thin wrapper around the same RPCs, since
   permission checks live inside the RPCs themselves (`auth.uid()`-based),
   not in route code.
7. **Quota is checked once per session, not once per turn — and it's fine
   for a wallet to go negative mid-session.** A multi-turn multimodal
   session (chat tutoring, speaking practice) is gated exactly once, at
   whichever call is first to establish that session's `attempt_sessions`
   row. Every subsequent turn in that session skips the balance check
   entirely (though the balance is still debited every turn, same as
   today) — so a long session can legitimately push a wallet negative, and
   nothing blocks it mid-flight. The *next* session's start check is what
   catches an exhausted wallet. One-shot AI surfaces with no session
   concept (rubric generation, evaluate, transliteration, dynamic
   questions) are unaffected — each such call is its own "session" and is
   checked every time, as originally designed.
8. **Nightly reconcile also verifies wallet balances, not just
   `ai_usage_counters`.** `ai_credit_balances.balance` is a maintained
   running total (incremented by `allocate_wallet_credits`, decremented by
   `debit_wallet_balance`), not recomputed on each check — so it can drift
   from its source (the ledger + invocations) the same way the Phase 2
   counters could. A new `reconcile_ai_credit_balances()` function,
   scheduled alongside the existing nightly reconcile, recomputes every
   wallet's expected balance from source and corrects + logs any drift.

**Still unchanged from the main plan:** the `wallet_id`-on-`ai_invocations`
wiring (§8 point 5), the `key_owner` dimension and its TS/SQL mirror
mapping, `debit_wallet_balance`'s shape, the `QUOTA_EXCEEDED` error
taxonomy, and the general placement of enforcement inside the gateway.

---

## Design decisions

**D1 — `ai_invocations` gains a nullable `wallet_id` column**, set once at
handle resolution, re-read (not re-looked-up) at `completeAiInvocation` so
the debit needs no second wallet query. Unchanged from the original draft.

**D2 — `institutionId` resolution moves up into the gateway.** Today
`institution_id` is only resolved inside `persistAiInvocationStart`
(`recordInvocation.ts:277-279`). `resolveMeteredModel`/`resolveMeteredSpeech`
now resolve it themselves right after `classDbId` is known (same
`resolveInstitutionId` helper, already exported from
`src/lib/logging/appLog.ts`) and thread it down explicitly, so
`persistAiInvocationStart` uses the given value instead of re-resolving.
Platform-scope calls (`classDbId` null) skip this and skip quota checks
entirely — no institution, no wallet, no-op, same as `record_usage_counter`
already does for `p_institution_id is null`.

**D3 — the TS-side key-owner mapping is a hand-written mirror of SQL's
`key_owner_from_source`,** not shared code — `src/lib/ai/metering/keyOwner.ts`
exports an exhaustive-switch `keyOwnerFromSource(keySource: AiConfigSource)`.
Needed pre-write (before any row exists to hand to SQL). Documented
duplication risk, not eliminated — see the original draft's D3 for the
full reasoning; unchanged.

**D4 — quota checks and wallet lookups always run through the
service-role client** (`src/lib/ai/metering/quota.ts`), independent of the
acting user's RLS grants — a student's AI call must be gated by wallet
state regardless of what that student can see. This is the opposite
client choice from **wallet funding/policy writes** (D9 below), which
deliberately go through the user's own session so `auth.uid()`-based
permission checks and audit `changed_by` attribution work. Two different
operations, two different clients, on purpose.

**D5 — no wallet row at all is treated identically to `enforcement='off'`
(unrestricted).** Absence of a wallet — not just `enforcement='off'` on an
existing one — means nothing is gated. An institution/class stays fully
unmetered until a wallet row exists for it, and (per D2's revision) a
class's capacity math simply doesn't run when its institution has no
wallet for that `key_owner`.

**D6 — quota is gated once per session, keyed off `attempt_sessions`
row-creation, not once per handle resolution.** (Revises the original
draft's D6, which checked on every `resolveMeteredModel`/`resolveMeteredSpeech`
call.) `ensureAttemptSession` (`src/lib/submissions/attemptSessions.ts:24`)
already does a first-writer-wins upsert (`on conflict (id) do nothing`) —
today it discards whether its own call was the one that inserted the row.
It's changed to return `{ created: boolean }` (via `.select("id")` after
the upsert — a conflict-ignored row returns no data, so `data.length > 0`
is exactly "this call created the session"). Every one of its 5 current
call sites (`attempt-start/route.ts:53`, `turn/route.ts:285`,
`audio/utterance/route.ts`, `evaluate/route.ts:210`,
`transcribe/route.ts` — confirmed via grep, all defensively call
`ensureAttemptSession` per the "deploy-skew window" comment already in the
code) sets a new `AiCallContext.isNewSession` field from that result.
Inside `resolveMeteredModel`/`resolveMeteredSpeech`:

- `context.sessionId` absent → always check (one-shot call, unchanged
  behavior).
- `context.sessionId` present and `context.isNewSession === true` → check
  once, here (this is the first AI call of a brand-new session).
- `context.sessionId` present and `context.isNewSession` falsy → **skip
  the balance check entirely.** The debit (D1, unchanged) still runs at
  completion regardless — only the *admission* check is skipped.

This keeps the check physically inside the gateway (so a future call site
still can't silently forget it — it always runs the *logic*, it just
short-circuits on `isNewSession`), rather than moving enforcement out to
the submissions layer where it would duplicate the gateway's own
keySource/keyOwner resolution. A turn route that resolves both TTS and LLM
handles on a session's first turn runs the check twice, independently
(they can resolve to different wallets by `key_owner`) — same tolerance
the original draft's D6 already accepted.

**D7 — found while reading the real call sites: two of the eight gateway
call sites don't catch `resolveMeteredSpeech` errors at all today.**
`tts/route.ts:65` and `transcribe/route.ts:152` call `resolveMeteredSpeech`
with no local try/catch, so an error thrown there (today: only
`AiNotConfiguredError`; after this phase: also `QuotaExceededError`) falls
through to whatever generic outer catch exists, losing the structured
`code`-based response the text path gets via the existing
`catalogNotConfiguredResponse` helper (`resolveCatalogConfig.ts:31`). Phase
3 adds a matching try/catch at both sites (and at `turn/route.ts:293`'s
currently-unguarded TTS resolution) using a new parallel
`quotaExceededResponse(error)` helper — fixing the pre-existing
`AiNotConfiguredError` gap on those routes as a byproduct.

**D8 — `class_allocation_capacity` bounds the *sum of current class
balances*, not a cumulative allocation total.** Checked at allocation time
as: `sum(balance) across every sibling class wallet under this
institution+key_owner, plus the new allocation, <= class_allocation_capacity`.
Framed this way (a live sum, not a monotonic ledger total) so that as
classes spend down their credits, room frees up under the institution's
ceiling for further allocation — a real "shared pool with a ceiling," not
a one-time budget that permanently shrinks the moment it's handed out.
`null` capacity skips the check (unbounded). This is **not** a transfer —
the institution wallet's own balance is never debited by a class
allocation (per the "separate capacity ceiling, not a transfer" decision).

**D9 — wallet funding/policy writes go through the acting user's own
Supabase client, not service-role, and mirror the existing
`ai_institution_settings` write pattern exactly** (separate INSERT/UPDATE
RLS policies + a `BEFORE INSERT OR UPDATE` lock-and-audit trigger,
`20260708000000_ai_institution_settings_admin_write_policy.sql` +
`ai_institution_settings_enforce_super_admin_locks_trg`,
`remote_schema.sql:314-334`). This is what makes `auth.uid()`-based
permission checks (`is_institution_admin`, `is_platform_super_admin` —
both already `SECURITY DEFINER SQL` functions keyed on `auth.uid()`,
confirmed in `remote_schema.sql:1169-1225`) and audit `changed_by`
attribution work correctly without threading an explicit actor id through
every call — the session already carries it. See §Implementation for the
concrete RLS policies and trigger.

**D10 — `self_manage_enabled` is a locked field, changeable only by a
super admin, on both INSERT and UPDATE** (an institution admin can create
their own institution's BYOK wallet row, but it starts `self_manage_enabled
= false` and stays that way until a super admin flips it — mirrors
`allow_admin_edit`'s default-`false`, opt-in-only posture exactly).

**D11 — `QUOTA_EXCEEDED` taxonomy, unchanged from the original draft.**
New `AiErrorCode` member, non-retryable, `QuotaExceededError` class in
`src/lib/ai/metering/quota.ts` mirroring `AiNotConfiguredError`'s shape.

**D12 — in-product messaging stays minimal this phase:** the
`QUOTA_EXCEEDED` code surfaced through the existing client-side
`errorData.code === ...` pattern (`MultimodalInputArea.tsx:953`,
`QuestionCard.tsx:198`), plus one `GET /api/ai/quota-status` read for a
future banner. The wallet **editor** and **funding** UI (forms for
allocating credits, toggling `self_manage_enabled`, setting capacity) is
this phase's actual new admin-facing surface — see §Implementation — but
the rich analytics (spend distribution, funding history views) stay Phase
4 per the main plan's file map.

**D13 — wallet balance drift is auto-corrected, not just flagged, mirroring
Phase 2's `ai_usage_counters` philosophy.** `ai_credit_balances` is
explicitly a derived cache — `ai_credit_transactions` (credits in) and
`ai_invocations.wallet_id`/`credits` (credits out, D1) are the real source
of truth, the same relationship `ai_usage_counters` has to `ai_invocations`.
So the nightly reconcile **overwrites** a drifted balance with the
recomputed correct value (not just an alert an admin has to act on) —
consistent with treating a wrong balance as actively dangerous (it drives
real enforcement decisions in both directions: under-reporting usage lets a
wallet overspend past its real limit, over-reporting wrongly blocks a
wallet that still has room), so leaving known drift in place until someone
notices is worse than self-healing it. The recompute is **full-history per
wallet, not windowed** — unlike `ai_usage_counters` (bucketed by calendar
month, so a closed month never changes and only the current/prior period
needs rebuilding), a wallet's balance is a single number spanning its
entire life with no natural "closed period" boundary, so there's no
window to bound the rebuild to. This is a `group by wallet_id` aggregate
over `ai_credit_transactions` and `ai_invocations` — indexed, one pass, no
per-wallet round trips — not a per-wallet loop querying twice each; cost
scales with total transaction/invocation volume, not wallet count. Revisit
(e.g. an incremental watermark per wallet) only if that volume ever makes
a nightly full recompute actually slow — not built preemptively.

---

## Implementation

### 1. Migration — `ai_credit_wallets` / `ai_credit_transactions` / `ai_credit_balances` / audit

New file `supabase/migrations/20260716000000_ai_credit_wallets.sql`:

```sql
create table public.ai_credit_wallets (
  id             uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  class_id       uuid references public.classes(id) on delete cascade,  -- null = institution-level
  key_owner      text not null default 'platform',                      -- 'platform' | 'byok'
  monthly_grant  numeric(14,4),      -- reserved for future cron (D-revision #1); inert this phase
  max_balance    numeric(14,4),      -- this wallet's own rollover cap; null = unbounded
  class_allocation_capacity numeric(14,4),  -- institution-only; null = unbounded (D8)
  soft_warn_threshold numeric(14,4),
  enforcement    text not null default 'off',       -- 'off' | 'warn' | 'block'
  self_manage_enabled boolean not null default false, -- institution-BYOK-only; locked, D10
  updated_at     timestamptz not null default now(),
  unique (institution_id, class_id, key_owner)
);

create table public.ai_credit_transactions (
  id           uuid primary key default gen_random_uuid(),
  wallet_id    uuid not null references public.ai_credit_wallets(id) on delete cascade,
  type         text not null,             -- 'monthly_grant' | 'topup' | 'allocation' | 'adjustment'
  credits      numeric(14,8) not null,
  period_start date,                      -- reserved for the future monthly grant job
  created_by   uuid references auth.users(id) on delete set null,
  note         text,
  created_at   timestamptz not null default now()
);
create index ai_credit_transactions_wallet_time_idx
  on public.ai_credit_transactions (wallet_id, created_at desc);

create table public.ai_credit_balances (
  wallet_id  uuid primary key references public.ai_credit_wallets(id) on delete cascade,
  balance    numeric(14,8) not null default 0,
  updated_at timestamptz not null default now()
);

create table public.ai_credit_wallet_policy_audit (
  id         uuid primary key default gen_random_uuid(),
  wallet_id  uuid not null references public.ai_credit_wallets(id) on delete cascade,
  changed_by uuid references auth.users(id) on delete set null,
  before     jsonb,        -- null on the wallet's first insert
  after      jsonb not null,
  created_at timestamptz not null default now()
);
create index ai_credit_wallet_policy_audit_wallet_time_idx
  on public.ai_credit_wallet_policy_audit (wallet_id, created_at desc);

alter table public.ai_invocations
  add column wallet_id uuid references public.ai_credit_wallets(id) on delete set null;

-- Partial (only wallet-attributed rows matter) — backs both the debit
-- read path and the nightly balance-reconcile aggregate (step 10).
create index ai_invocations_wallet_id_idx
  on public.ai_invocations (wallet_id) where wallet_id is not null;
```

**RLS — reads** (three-tier, mirrors `ai_usage_counters`) on all four
tables: super admin → all; institution admin → their institution's rows
(join through `wallet_id` for the transactions/balances/audit tables);
class teacher/admin → their class's rows.

**RLS — writes on `ai_credit_wallets`** (D9), split INSERT vs. UPDATE like
`ai_institution_settings`:

```sql
create policy "Admins create wallets in their scope" on public.ai_credit_wallets
  for insert
  with check (
    public.is_platform_super_admin()
    or (class_id is not null and public.is_institution_admin(institution_id))
    or (class_id is null and key_owner = 'byok' and public.is_institution_admin(institution_id))
  );

create policy "Admins update wallets in their scope" on public.ai_credit_wallets
  for update
  using (
    public.is_platform_super_admin()
    or (class_id is not null and public.is_institution_admin(institution_id))
    or (class_id is null and key_owner = 'byok' and self_manage_enabled and public.is_institution_admin(institution_id))
  )
  with check (
    public.is_platform_super_admin()
    or (class_id is not null and public.is_institution_admin(institution_id))
    or (class_id is null and key_owner = 'byok' and self_manage_enabled and public.is_institution_admin(institution_id))
  );
```

Note the asymmetry: an institution admin can **create** their institution's
BYOK wallet row (it starts locked), but can only **update** it once
`self_manage_enabled` is already true — resolved by a super admin's prior
write. A platform-key_owner institution-level wallet is never writable by
an institution admin at all (only super admin), regardless of INSERT or
UPDATE.

**Lock-and-audit trigger** (D9, D10):

```sql
create or replace function public.ai_credit_wallets_enforce_locks_and_audit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_super_admin() then
    if TG_OP = 'INSERT' and NEW.self_manage_enabled then
      raise exception 'Only platform super admins may enable self_manage_enabled';
    end if;
    if TG_OP = 'UPDATE' and NEW.self_manage_enabled is distinct from OLD.self_manage_enabled then
      raise exception 'Only platform super admins may change self_manage_enabled';
    end if;
  end if;

  insert into public.ai_credit_wallet_policy_audit (wallet_id, changed_by, before, after)
  values (
    NEW.id, auth.uid(),
    case when TG_OP = 'UPDATE' then to_jsonb(OLD) else null end,
    to_jsonb(NEW)
  );

  return NEW;
end;
$$;

create trigger ai_credit_wallets_enforce_locks_and_audit_trg
  before insert or update on public.ai_credit_wallets
  for each row execute function public.ai_credit_wallets_enforce_locks_and_audit();
```

No write RLS policies on `ai_credit_transactions`/`ai_credit_balances` —
those are only ever written by `allocate_wallet_credits` (step 2, `SECURITY
DEFINER`) and `debit_wallet_balance` (service-role, gateway-only), never
by a direct client insert.

*Verify:* as an institution-admin test user, confirm: creating their
institution's BYOK wallet succeeds; updating its `enforcement` fails until
a super-admin-run update sets `self_manage_enabled = true`, after which it
succeeds; attempting to set `self_manage_enabled` themselves (even to
`true`) fails either way. Confirm every successful UPDATE produces exactly
one `ai_credit_wallet_policy_audit` row with the correct before/after
snapshot and `changed_by`.

### 2. `allocate_wallet_credits` — funding, with capacity + permission checks (D8, D9)

```sql
create or replace function public.allocate_wallet_credits(
  p_wallet_id uuid, p_credits numeric, p_note text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_wallet public.ai_credit_wallets%rowtype;
  v_is_super boolean := public.is_platform_super_admin();
  v_capacity numeric(14,4);
  v_current_class_sum numeric(14,4);
  v_type text;
begin
  select * into v_wallet from public.ai_credit_wallets where id = p_wallet_id;
  if v_wallet.id is null then
    raise exception 'Wallet % not found', p_wallet_id;
  end if;

  if v_wallet.class_id is null then
    v_type := 'topup';
    if v_wallet.key_owner = 'platform' and not v_is_super then
      raise exception 'Only platform super admins may fund a platform institution wallet';
    end if;
    if v_wallet.key_owner = 'byok' and not v_is_super
       and not (v_wallet.self_manage_enabled and public.is_institution_admin(v_wallet.institution_id)) then
      raise exception 'Not permitted to fund this institution''s BYOK wallet';
    end if;
  else
    v_type := 'allocation';
    if not v_is_super and not public.is_institution_admin(v_wallet.institution_id) then
      raise exception 'Not permitted to fund this class wallet';
    end if;

    select w.class_allocation_capacity into v_capacity
    from public.ai_credit_wallets w
    where w.institution_id = v_wallet.institution_id
      and w.class_id is null and w.key_owner = v_wallet.key_owner;

    if v_capacity is not null then
      select coalesce(sum(b.balance), 0) into v_current_class_sum
      from public.ai_credit_balances b
      join public.ai_credit_wallets w on w.id = b.wallet_id
      where w.institution_id = v_wallet.institution_id
        and w.class_id is not null and w.key_owner = v_wallet.key_owner;

      if v_current_class_sum + p_credits > v_capacity then
        raise exception 'Allocating % would exceed institution capacity (currently % of % allocated)',
          p_credits, v_current_class_sum, v_capacity;
      end if;
    end if;
  end if;

  insert into public.ai_credit_transactions (wallet_id, type, credits, created_by, note)
  values (p_wallet_id, v_type, p_credits, auth.uid(), p_note);

  insert into public.ai_credit_balances (wallet_id, balance)
  values (p_wallet_id, p_credits)
  on conflict (wallet_id) do update
    set balance = ai_credit_balances.balance + excluded.balance, updated_at = now();
end;
$$;

grant execute on function public.allocate_wallet_credits(uuid, numeric, text) to authenticated;
```

Called from the admin UI's server action via the user's own authenticated
Supabase client (`createServerSupabaseClient()`, **not**
`createServiceRoleClient()`), which is what makes `auth.uid()` inside the
function resolve to the acting admin — this is the "UI-driven now, API-
ready later" function from decision #6: a future public API route just
needs to authenticate the caller and call this same RPC, no redesign.
`grant_monthly_credits`/`record_topup` from the original main-plan draft
are **superseded** by this one function — no separate topup path is built
this phase, since manual allocation via the UI covers everything a topup
endpoint would have done, with proper capacity/permission checks the
original simpler design didn't have.

*Verify:* as an institution admin, allocate credits to a class in their
institution — confirm success, correct ledger `type='allocation'`, balance
increase, and (with a finite `class_allocation_capacity` set) confirm an
over-limit allocation is rejected with a clear error and no partial write
(single transaction — either both inserts happen or neither does). Confirm
the same institution admin cannot allocate to a class in a different
institution, and cannot fund their own institution's *platform* wallet.

### 3. `src/lib/ai/metering/keyOwner.ts`, `quota.ts`, `errors.ts`

Unchanged in shape from the original draft (D3, D11) — `keyOwnerFromSource`,
`getQuotaStatus`/`assertWithinQuota` (service-role, D4), `QuotaExceededError`
/ `QUOTA_EXCEEDED_ERROR_CODE`, `quotaExceededResponse(error)` helper
mirroring `catalogNotConfiguredResponse`, `AiErrorCode` gains
`"QUOTA_EXCEEDED"` (non-retryable) in `errors.ts`.

`getQuotaStatus` implements D5 (no wallet row → `'unrestricted'`) and is
otherwise unchanged: most-specific-first lookup (class row, else
institution row, for the given `key_owner`), reading `ai_credit_balances`
for the resolved wallet.

### 4. `ensureAttemptSession` → returns `{ created: boolean }` (D6)

```ts
export async function ensureAttemptSession(
  client: SupabaseClient,
  input: EnsureAttemptSessionInput,
): Promise<{ created: boolean }> {
  const { data, error } = await client
    .from("attempt_sessions")
    .upsert({ id: input.id, ... }, { onConflict: "id", ignoreDuplicates: true })
    .select("id");
  if (error) {
    console.error("[ensureAttemptSession] failed to upsert:", error);
    return { created: false };
  }
  return { created: (data?.length ?? 0) > 0 };
}
```

All 5 call sites (`attempt-start/route.ts:53`, `turn/route.ts:285`,
`audio/utterance/route.ts`, `evaluate/route.ts:210`, `transcribe/route.ts`)
capture the result and set `AiCallContext.isNewSession` (new optional
field on `AiCallContext`, `gateway/model.ts:23-36`) before calling
`resolveMeteredModel`/`resolveMeteredSpeech`.

*Verify:* two concurrent requests racing to create the same `sessionId`
(simulate with a quick double-call) — confirm exactly one gets
`created: true`.

### 5. Gateway wiring — `model.ts` / `speech.ts` (D2, D6)

Both `resolveMeteredModel` and `resolveMeteredSpeech`, right after
`keySource`/`config` resolve and before constructing the handle:

1. Resolve `institutionId` (D2) — skip everything below if `classDbId` is
   null.
2. `keyOwner = keyOwnerFromSource(keySource)`.
3. Decide whether to actually check: `context.sessionId == null ||
   context.isNewSession === true`. If not, skip straight to step 5 with
   `walletId` from a cheap wallet-lookup-only call (no balance check) —
   still need `walletId` for the debit later even when the balance check
   is skipped.
4. If checking: `assertWithinQuota({ institutionId, classId,
   keyOwner })` — throws `QuotaExceededError` before any provider
   credential is touched or row is written.
5. `institutionId` and `walletId` thread into the invocation payload
   (`StartAiInvocationInput` gains `institutionId?`/`walletId?`).

*Verify:* set a test wallet to `enforcement='block'`, balance `0`. First
turn of a new session: confirm `QuotaExceededError` thrown, no
`ai_invocations` row written. Second turn of an *already-admitted* session
against the same wallet: confirm the call is admitted (no throw) even
though the balance is still `0`/negative, and confirm the debit still
applies (balance goes further negative).

### 6. `recordInvocation.ts` — wallet debit (D1, unchanged from original draft)

`StartAiInvocationInput` gains `institutionId?`/`walletId?`;
`persistAiInvocationStart` uses them when given. `completeAiInvocation`'s
existing re-read adds `wallet_id` to its `.select(...)`. After the counter
upsert, a sibling `debitWalletBalance(walletId, credits)` call — same
awaited-first-attempt / `after()`-retried-remainder shape as
`upsertUsageCounter`, gated on `wallet_id` being non-null. No permission
check here (service-role, system write) and **no floor at zero** — this is
exactly the "fine to go negative" behavior from decision #7.

### 7. Route wiring — `QUOTA_EXCEEDED` surfacing (D7)

Add `quotaExceededResponse(error)` alongside `catalogNotConfiguredResponse(error)`
at all 6 already-guarded `resolveMeteredModel` sites; add a new try/catch
(checking both helpers) at the 2 unguarded `resolveMeteredSpeech` sites and
`turn/route.ts:293`'s TTS resolution.

### 8. Admin UI — wallet funding + policy forms (D9, D12)

New, minimal — this is this phase's actual admin-facing surface (no
dashboards, just the forms needed to operate wallets manually):

- An institution-scoped page (extends the existing institution admin
  settings area, e.g. alongside `InstitutionAiManagementTab.tsx`'s pattern)
  showing the institution's platform + BYOK wallets, each class's wallet,
  and forms to: create a wallet, set `enforcement`/`max_balance`/
  `soft_warn_threshold`/`class_allocation_capacity`, and allocate credits
  (`allocate_wallet_credits`) — visibility/editability driven entirely by
  the RLS policies + trigger from step 1, so the UI can render the same
  form for a super admin and an institution admin and let Postgres be the
  actual authority.
- A platform-only control to toggle `self_manage_enabled` per institution's
  BYOK wallet (super-admin-only page, e.g. under `/platform`).
- Both are plain Next.js server actions calling `allocate_wallet_credits`
  / a direct `ai_credit_wallets` upsert through the user's authenticated
  client — no new API route.

### 9. Status endpoint + client surfacing (D12)

`GET /api/ai/quota-status?classId=…` (service-role `getQuotaStatus`,
auth'd to class teacher/institution admin), plus the `QUOTA_EXCEEDED_ERROR_CODE`
branch in `MultimodalInputArea.tsx`/`QuestionCard.tsx`. Not wired into a
specific page yet — same as the original draft's D10.

### 10. Migration — nightly wallet balance reconcile (D13)

New file `supabase/migrations/20260716010000_pg_cron_wallet_balance_reconcile.sql`
(`pg_cron` extension already exists from Phase 2's
`20260714010000_pg_cron_usage_reconcile.sql` — no re-create needed):

```sql
create or replace function public.reconcile_ai_credit_balances()
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_row record;
begin
  for v_row in
    with credited as (
      select wallet_id, coalesce(sum(credits), 0) as total_credited
      from public.ai_credit_transactions
      group by wallet_id
    ),
    debited as (
      select wallet_id, coalesce(sum(credits), 0) as total_debited
      from public.ai_invocations
      where status = 'completed' and credits is not null and wallet_id is not null
      group by wallet_id
    ),
    expected as (
      select w.id as wallet_id,
             coalesce(c.total_credited, 0) - coalesce(d.total_debited, 0) as expected_balance
      from public.ai_credit_wallets w
      left join credited c on c.wallet_id = w.id
      left join debited d on d.wallet_id = w.id
    )
    select e.wallet_id, e.expected_balance, coalesce(b.balance, 0) as before_balance
    from expected e
    left join public.ai_credit_balances b on b.wallet_id = e.wallet_id
    where abs(coalesce(b.balance, 0) - e.expected_balance) > 0.00000001
  loop
    insert into public.ai_credit_balances (wallet_id, balance)
    values (v_row.wallet_id, v_row.expected_balance)
    on conflict (wallet_id) do update
      set balance = excluded.balance, updated_at = now();

    insert into public.app_logs (level, source, event, message, metadata)
    values (
      'warn', 'usage_metering', 'wallet_balance_drift',
      format('ai_credit_balances drift for wallet %s: %s -> %s credits',
        v_row.wallet_id, v_row.before_balance, v_row.expected_balance),
      jsonb_build_object(
        'wallet_id', v_row.wallet_id,
        'before_balance', v_row.before_balance,
        'after_balance', v_row.expected_balance
      )
    );
  end loop;
end;
$$;

revoke execute on function public.reconcile_ai_credit_balances() from anon, authenticated;

select cron.schedule(
  'ai-credit-balances-nightly-reconcile',
  '10 8 * * *',  -- 10 min after the usage-counters reconcile (same 08:00 UTC window)
  $$ select public.reconcile_ai_credit_balances(); $$
);
```

Every drifted wallet gets both corrected (the balance `assertWithinQuota`
reads is right again on the very next check) and logged (a `warn`-level
`app_logs` row naming the wallet and the before/after values — same
severity and shape as Phase 2's `counter_drift` event) — this is the signal
that a `debit_wallet_balance` or `allocate_wallet_credits` call failed
somewhere upstream and needs investigating, exactly the same relationship
`counter_drift` has to a failed `record_usage_counter` call.

*Verify:* manually `update ai_credit_balances set balance = balance + 500
where wallet_id = <test wallet>;` (simulate drift), run `select
public.reconcile_ai_credit_balances();`, confirm the balance is corrected
back to the ledger-derived value and a `wallet_balance_drift` row appears
in `app_logs` with the right before/after numbers. Run it again immediately
after — confirm it's a no-op (no new log row, nothing updated) when nothing
has drifted.

---

## File map (new/changed)

- `supabase/migrations/20260716000000_ai_credit_wallets.sql` — tables,
  RLS, lock-and-audit trigger, `allocate_wallet_credits`, `wallet_id`
  column + index on `ai_invocations` (steps 1-2).
- `supabase/migrations/20260716010000_pg_cron_wallet_balance_reconcile.sql`
  — `reconcile_ai_credit_balances()` + cron schedule (step 10).
- `src/lib/ai/metering/keyOwner.ts`, `quota.ts` — new (step 3).
- `src/lib/ai/errors.ts` — `QUOTA_EXCEEDED` (step 3).
- `src/lib/submissions/attemptSessions.ts` — `ensureAttemptSession` return
  type (step 4).
- `src/lib/ai/gateway/model.ts`, `speech.ts` — `AiCallContext.isNewSession`,
  quota wiring (step 5).
- `src/lib/ai/logging/types.ts`, `recordInvocation.ts` — `institutionId`/
  `walletId` threading, wallet debit (step 6).
- 8 route files — `QUOTA_EXCEEDED` catch wiring (step 7).
- 5 route files calling `ensureAttemptSession` — capture `created`, set
  `isNewSession` (step 4).
- New institution wallet admin UI + server actions; new platform
  `self_manage_enabled` toggle UI (step 8).
- `src/app/api/ai/quota-status/route.ts` — new (step 9).
- `MultimodalInputArea.tsx`, `QuestionCard.tsx` — client-side code check
  (step 9).

**Explicitly not built this phase:** the monthly-grant `pg_cron` job (schema
stays ready — `monthly_grant`, `ai_credit_transactions.period_start`,
`grant_monthly_credits` can still be added as a plain callable function
whenever the cron lands, no migration rework needed); any public REST API
for funding/policy actions; Phase 4's dashboards/spend-distribution views.

---

## Sequencing

1. **Wallet + ledger + audit migration** (§1-2) — additive, zero call
   sites touched, safe to ship idle.
2. **`keyOwner.ts` / `quota.ts` / `errors.ts`** (§3) — pure/service-role,
   independently verifiable against step 1's schema.
3. **`ensureAttemptSession` return-type change** (§4) — small, mechanical,
   touches 5 call sites; safe on its own since nothing reads
   `isNewSession` yet.
4. **Gateway wiring** (§5-6) — the one behavior-changing step. Every
   wallet still starts with no row at all (D5: unrestricted), so this is a
   no-op until step 8's UI (or manual SQL) actually creates a wallet with
   `enforcement != 'off'`.
5. **Route `QUOTA_EXCEEDED` wiring** (§7) — lands in the same PR as step 4,
   not after (D7's pre-existing-gap reasoning: shipping enforcement
   without this means 2 of 8 routes degrade a block to a raw 500).
6. **Admin UI** (§8) — depends on step 1's RLS/RPC; this is what actually
   lets anyone create a wallet with real enforcement, so it's reasonable
   to land after step 4-5 are proven safe with a hand-inserted test wallet.
7. **Status endpoint + client surfacing** (§9) — lowest risk, ships last.
8. **Wallet balance reconcile cron** (§10) — depends only on step 1's
   schema (`ai_invocations.wallet_id`, `ai_credit_transactions`); safe to
   ship any time after step 1, included here at the end only because
   there's nothing to reconcile yet until step 6 lets a real wallet
   accumulate transactions.

## Verification

No test runner/CI in this repo. After each step: `npx tsc --noEmit`,
`npm run lint`, `npm run validate:ai-metering`, `npm run build`. Per-step
manual/SQL verification is detailed inline above.

## Open questions

- Exact placement of the institution wallet admin UI (new tab on the
  existing institution settings page vs. a standalone `/admin/institutions/:id/wallets`
  route) — implementation-time call, doesn't affect the data model.
- Whether `class_allocation_capacity` should have a companion "currently
  allocated" readout in the UI (a simple derived query, no new schema) —
  natural to include alongside the allocation form in step 8, not called
  out as a separate step above since it's the same page.
- Where the quota-status banner (§9) actually gets wired in — left open,
  same as the original draft.
