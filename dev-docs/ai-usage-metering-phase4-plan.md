# Phase 4 — AI Usage Metering: Admin/Teacher UI Surfaces

Companion implementation plan for `dev-docs/ai-usage-metering-plan.md` §8.1
and §9 point 4, and for `dev-docs/ai-usage-metering-phase3-plan.md`'s
"explicitly not built this phase: Phase 4's dashboards/spend-distribution
views." Phases 1–3 are implemented on `usage-metering`: every AI call is
metered into `ai_invocations`, rolled up into `ai_usage_counters`, and gated
by `ai_credit_wallets` / `ai_credit_transactions` / `ai_credit_balances`.
Phase 3 shipped a deliberately minimal, functional-but-unstyled admin UI
(`WalletsManagementView.tsx`) and auto-provisioning triggers for *new*
institutions/classes only
(`supabase/migrations/20260717000000_ai_credit_wallets_auto_provision.sql`).

Status: **PLAN — not started.** Written 2026-07-15.

## 1. What's missing

1. **Institutions/classes created before 2026-07-17 have no wallet at all**
   — the auto-provision triggers are `AFTER INSERT`, so existing rows were
   never backfilled.
2. **No spend-visibility UI** — `ai_invocations`/`ai_usage_counters` have no
   query layer or dashboard; nobody can see "where credits are going."
3. **Wallet UI doesn't match the app's design system** — raw HTML forms
   instead of the `ui/` shadcn primitives every other settings surface uses.
4. **Institution/class "enable AI + set a limit" is really two existing,
   disconnected mechanisms** an admin has to configure separately today:
   `ai_institution_settings.allow_use_platform_defaults` (access — can this
   scope use platform-funded AI at all) and the platform-`key_owner`
   `ai_credit_wallets` row's `enforcement`/balance (spend cap). Nothing
   presents them as one control.
5. **Class settings has no tabs at all** — it's a single scrolling page
   (`ClassSettingsClient.tsx`); the AI-related section renders inline with
   no way to give AI its own tab the way `InstitutionSettingsTabs.tsx`
   already does for institutions.

This plan closes all five gaps, reusing existing patterns rather than
inventing new ones.

## 2. Existing patterns this plan reuses

- **Institution AI management tab** (`InstitutionSettingsTabs.tsx` →
  `InstitutionAiManagementTab.tsx`) — `Tabs`/`TabsContent` +
  `MutedPrimaryTabs*` styling, a `?settingsTab=` query param, gated by
  `canViewInstitutionOverrideSections` (`src/lib/settings/capabilities.ts`).
  This is the container the wallet/usage work moves *into*.
- **`AiConfigLocksRow.tsx`** — the toggle-a-lock pattern (`Switch` + `Label`
  + `useTransition` + server action), the direct precedent for the new
  "enable platform AI access" control.
- **`AppLogsFilterBar.tsx` / `AppLogsTable.tsx`** (`/platform/logs`,
  `/admin/institutions/[id]/logs`) — GET-query-param filter form + plain
  presentational `<table>`, server-component-friendly. Direct precedent for
  the new usage-spending table.
- **admin/platform route pairing** — every institution-scoped admin page
  exists twice (`/admin/institutions/[id]/...` via
  `requireInstitutionAdminOrSuper`, `/platform/institutions/[id]/...` via
  `requireSuperAdmin`), sharing one presentational component with a
  `basePath: "admin" | "platform"` prop. Followed as-is for anything new.
- **`ai_credit_wallets`/`aiCreditWallets.ts`/`actions.ts`** (phase-3 plan's
  D9: writes go through the user's own Supabase client, not service-role, so
  `auth.uid()`-based RLS/trigger checks work) — kept exactly as-is; only the
  *presentation* layer changes.
- **shadcn primitives already in `src/components/ui/`** — `Card`, `Button`,
  `Switch`, `Select`, `Input`, `Label`, `Tabs` — used in place of raw HTML.

## 3. Design decisions (adopted defaults, no schema changes needed)

1. **"Enable platform AI + limit/unbounded" is a UI composition, not a new
   DB field.** Institution scope: "Platform AI access" toggle =
   `allow_use_platform_defaults` (existing field/action, reused via
   `AiConfigLocksRow`'s pattern) shown together with "Spending: Unbounded /
   Limited (N credits)" = the institution's platform-`key_owner` wallet
   (`enforcement='off'` ↔ Unbounded, `enforcement='block'` + balance ↔
   Limited). Class scope has no independent access flag today, so "enable
   AI for this class" maps purely to the class's own platform wallet in the
   same Unbounded/Limited/Disabled framing (`Disabled` = `block` + balance
   `0`). No new columns; a new small presentational component
   (`AiAccessAndLimitCard.tsx`) composes the two existing writes.
2. **Wallets + usage move *inside* `InstitutionAiManagementTab` as nested
   sub-tabs** ("Configuration" / "Wallets & limits" / "Usage"), per the
   product ask that these settings live under AI management itself. The
   standalone `/admin|platform/institutions/[id]/wallets` pages become thin
   redirects to `?settingsTab=ai&aiSubTab=wallets` (no dead links, no
   duplicated UI).
3. **Class settings gets tabbed**, mirroring `InstitutionSettingsTabs.tsx`
   exactly: all current flat sections move under a "General" tab unchanged;
   a new "AI management" tab hosts `ClassAiManagementTab` (existing
   provider/model override config) plus the new wallet and usage sub-tabs,
   same 3-way split as the institution side.
4. **Class "AI management" tab visibility**: shown iff
   `canViewClassOverrideSections(viewerRole, allowChildOverride)` **or** the
   class has its own `ai_credit_wallets` row — i.e. either they're allowed
   to manage AI config, or there's a wallet to see even without override
   rights. Requires one new cheap existence check threaded alongside the
   existing `institutionPolicy`/`classOverridePolicy` fetch in all three
   class-settings `page.tsx` loaders (teacher, admin, platform).
5. **Backfill is a one-time migration**, not an admin-triggered button —
   consistent with how `ai_class_settings`' continuity backfill
   (`20260708020000_per_class_ai_override.sql`) was done. Idempotent
   (`where not exists (...)` guards), reuses the exact same seeding logic as
   `seed_institution_ai_credit_wallet`/`seed_class_ai_credit_wallet` (copied
   into a one-off `DO $$ ... $$` block, not a refactor of the trigger
   functions — keeps the change small and doesn't touch live trigger code).
6. **Usage queries**: cheap cuts (by `usage_type`, by `key_owner`, current
   balance) read `ai_usage_counters`/`ai_credit_balances`; heavier cuts (by
   model, by class, by teacher, over time) read `ai_invocations` directly,
   scoped by institution/class — exactly the split the main plan's §8.1
   table already specifies. One new module, `src/lib/queries/aiUsage.ts`,
   parameterized by scope so it backs both the institution and class views
   (and a future teacher-only view) without duplication.

## 4. Implementation stages

**Stage 1 — Backfill migration.**
`supabase/migrations/20260718000000_ai_credit_wallets_backfill_existing.sql`:
for every `institutions` row with no platform-`key_owner` wallet, insert one
(`enforcement='block'`, 10,000 default credits, same as the trigger); for
every `classes` row with no platform wallet, insert one using
`ai_institution_settings.default_class_wallet_credits` (null → `off`
enforcement, matching `seed_class_ai_credit_wallet`'s logic). Guarded with
`where not exists (select 1 from ai_credit_wallets ...)` so it's safe to
re-run.

**Stage 2 — `src/lib/queries/aiUsage.ts` (new).**
`getUsageBreakdown({ institutionId, classId?, keyOwner?, groupBy, from, to })`
and `getWalletFundingHistory(walletId)` per decision 6. Pure server-only
query functions, no UI — verified independently before building screens on
top.

**Stage 3 — Shared presentational components (new, under
`src/components/Settings/AiConfig/` and a new
`src/components/Settings/AiConfig/Wallet/` subfolder):**
- `AiAccessAndLimitCard.tsx` — decision 1's unified enable+limit control,
  scope-parameterized (`institution` | `class`).
- `WalletCard.tsx`, `WalletPolicyForm.tsx`, `AllocateCreditsForm.tsx`,
  `CreateWalletForm.tsx` — rebuilt from `WalletsManagementView.tsx`'s logic
  using `Card`/`Select`/`Input`/`Label`/`Button` instead of raw HTML; same
  server actions from `src/app/admin/institutions/[id]/wallets/actions.ts`
  (kept, just re-consumed from the new component locations).
- `UsageFilterBar.tsx`, `UsageSummaryCards.tsx`, `UsageBreakdownTable.tsx` —
  mirroring `AppLogsFilterBar.tsx`/`AppLogsTable.tsx`, backed by Stage 2.

**Stage 4 — Institution AI management tab restructure.**
`InstitutionAiManagementTab.tsx` gains nested `Tabs`: Configuration (today's
`AiSettingsPageContent`), "Wallets & limits" (Stage 3 wallet components +
`AiAccessAndLimitCard`), "Usage" (Stage 3 usage components). Remove the
"Manage wallets" link-out card from `InstitutionSettingsTabs.tsx`'s General
tab. Point the two standalone `/wallets` pages at a redirect to
`?settingsTab=ai&aiSubTab=wallets` (keep the routes alive, no dead links).

**Stage 5 — Class settings tabs.** Convert `ClassSettingsClient.tsx` to a
`Tabs` layout mirroring `InstitutionSettingsTabs.tsx` (General / AI
management, same `?settingsTab=` param convention). Update the three
`page.tsx` loaders (`teacher/classes/[classId]/settings`,
`admin/institutions/[id]/classes/[classDbId]`,
`platform/institutions/[id]/classes/[classDbId]`) to also fetch "does this
class have its own wallet" (one cheap `ai_credit_wallets` existence check)
for decision 4's visibility rule. New "AI management" tab content =
`ClassAiManagementTab` (existing) + class-scoped `AiAccessAndLimitCard` +
class wallet card + class-scoped usage view (Stage 3 components, `classId`
filter).

**Stage 6 — Verify end-to-end.** `npx tsc --noEmit`, `npm run lint`,
`npm run build` (this repo has no test runner/CI). Manually: as super admin,
confirm a pre-2026-07-17 institution now has a wallet post-backfill; toggle
the unified access+limit control at both scopes and confirm the underlying
`allow_use_platform_defaults`/`enforcement`/balance actually change; confirm
the usage tab shows real numbers for a class with existing `ai_invocations`
rows; confirm the class AI management tab is hidden for a class with no
wallet and no override rights, and visible once either condition is met.

## 5. File map

- **new** `supabase/migrations/20260718000000_ai_credit_wallets_backfill_existing.sql`
- **new** `src/lib/queries/aiUsage.ts`
- **new** `src/components/Settings/AiConfig/AiAccessAndLimitCard.tsx`
- **new** `src/components/Settings/AiConfig/Wallet/{WalletCard,WalletPolicyForm,AllocateCreditsForm,CreateWalletForm}.tsx`
- **new** `src/components/Platform/Usage/{UsageFilterBar,UsageSummaryCards,UsageBreakdownTable}.tsx`
- `src/components/Settings/InstitutionAiManagementTab.tsx` — nested sub-tabs
- `src/components/Settings/InstitutionSettingsTabs.tsx` — drop wallets link-out card
- `src/app/admin/institutions/[id]/wallets/page.tsx`,
  `src/app/platform/institutions/[id]/wallets/page.tsx` — become redirects
- `src/components/Settings/WalletsManagementView.tsx` — superseded by Stage 3 components (deleted once Stage 4 lands)
- `src/components/Settings/ClassSettingsClient.tsx` — tabbed layout
- `src/components/Settings/ClassAiManagementTab.tsx` — extended with wallet/usage sub-tabs
- `src/app/teacher/classes/[classId]/settings/page.tsx`,
  `src/app/admin/institutions/[id]/classes/[classDbId]/page.tsx`,
  `src/app/platform/institutions/[id]/classes/[classDbId]/page.tsx` — thread class-wallet-existence check
- `src/lib/queries/aiCreditWallets.ts` — add `classHasWallet(classId)` helper if not trivially derivable from existing `listWalletsForInstitution`

## 6. Verification

No test runner/CI in this repo. After each stage: `npx tsc --noEmit`,
`npm run lint`, `npm run build`. End-to-end manual pass per Stage 6 above.

## 7. Open questions

- Exact copy/labels for the "Unbounded / Limited / Disabled" spending
  control — implementation-time UX call.
- Whether the class-scoped usage view should also be surfaced read-only to
  `class_co_teacher` (today excluded from `canViewClassOverrideSections`) —
  deferred; the existence-check visibility rule (decision 4) already covers
  the primary "does this class have a wallet" case without deciding this.
- Whether `WalletsManagementView.tsx` should be deleted outright once Stage
  4 lands or kept temporarily behind the redirect for one release as a
  rollback path — leaning toward deleting immediately (redirect + Stage 3
  components fully replace it), but not decided.
