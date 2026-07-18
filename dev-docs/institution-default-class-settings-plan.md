# Institution Default Class Settings — Content Types & Analytics Visibility

## Goal

Give **each institution** its own default class settings that class-level admins can
override, for two concrete settings:

1. **Allowed Content Types** — which of the four creatable content types (Activity,
   Quiz, Content, Survey) a class may create. **Quiz and Survey are off by default.**
2. **Students → Analytics tab visibility** — the Analytics sub-tab inside a class's
   Students tab. **Hidden by default;** admins can allow it.

Requirements:
- Defaults live **at the institution level** (each institution owns its own copy).
- **Overrideable per class** by a **super admin** or **institution admin** (not ordinary
  class teachers).
- The mechanism must be **extensible and robust** so future settings drop in uniformly.

## Reuse the existing hierarchical settings framework

The repo already has a general-purpose, DB-backed settings system with the exact
inheritance semantics this needs. **No new table.** Adding a setting is appending a
registry entry; making it institution-owned is one small, reusable framework addition
(below).

| Concern | File |
|---|---|
| Registry (add entries here) | [src/lib/settings/registry.ts](../src/lib/settings/registry.ts) |
| Resolver: default → institution → class, with `clamp` | [src/lib/settings/resolve.ts](../src/lib/settings/resolve.ts) |
| Capabilities matrix (`classOverrideAdminOnly`, locks) | [src/lib/settings/capabilities.ts](../src/lib/settings/capabilities.ts) |
| Server actions (upsert/lock/override) | [src/lib/settings/actions.ts](../src/lib/settings/actions.ts) |
| Write guards | [src/lib/settings/enforce.ts](../src/lib/settings/enforce.ts) |
| DB access | [src/lib/queries/settings.ts](../src/lib/queries/settings.ts) |
| Built-in controls (`boolean` switch, `string_array` checkbox group) | [src/components/Settings/SettingControl.tsx](../src/components/Settings/SettingControl.tsx) |
| Institution settings UI | [InstitutionDetailView.tsx](../src/components/Platform/InstitutionDetailView.tsx) → `InstitutionSettingsTabs` → `SettingsList` |
| Class override UI | [ClassInheritedSettingsSection.tsx](../src/components/Settings/ClassInheritedSettingsSection.tsx) in [ClassSettingsClient.tsx](../src/app/teacher/classes/[classId]/settings/ClassSettingsClient.tsx) |
| Client hook for effective values | [useSettings.ts](../src/hooks/swr/useSettings.ts) |

## How the framework's defaults & locks actually work (verified in source + SQL)

Storage: one row per `(scope, scope_id, key)` in `public.setting_values` with columns
`value`, `allow_admin_edit`, `allow_child_override` (both **default `false`** at the DB
level). Resolution chain per class is **registry `default` → institution row → class
row**. There is no separate "platform" row — so **the registry `default` IS the
effective institution default whenever an institution has no explicit row.**

The authorization facts that drive the design (from the `setting_values_enforce_locks`
trigger + RLS in [remote_schema.sql](../supabase/migrations/20260526165126_remote_schema.sql), lines 1475/4048/4076/4098):

- **Super admin** bypasses every lock; can always read/write any row.
- **`allow_admin_edit` is super-admin-controlled** — the trigger forbids any non-super
  admin from *changing* it on UPDATE. (On INSERT there is no such check, so a first-write
  can set it — a subtlety we deliberately avoid relying on; see below.)
- **Institution value edits by an institution admin require an existing row with
  `allow_admin_edit = true`.** With no row, the resolver reports `allowAdminEdit: false`
  (hard-coded `DEFAULT_LOCKS` in [resolve.ts](../src/lib/settings/resolve.ts)), and the
  capabilities matrix hides editing from institution admins. So **out of the box an
  institution admin cannot manage an institution default** — only a super admin can.
- **Class override writes** are permitted by the trigger when the parent institution row
  is absent *or* has `allow_child_override = true`; a parent row with
  `allow_child_override = false` **blocks the class write for institution admins too**
  (only super admin is exempt). `classOverrideAdminOnly: true` is what keeps ordinary
  class teachers out at the app layer.
- RLS policy **"Institution admins manage settings"** already lets an institution admin
  write institution-scope rows for their institution and class-scope rows for their
  classes.

**Implication (the key design point):** the moment any institution row is materialized,
its `allow_admin_edit` / `allow_child_override` columns matter. If a row is created
without setting them (they default to `false`), the institution admin is immediately
locked out of further value edits **and** class overrides get blocked. Therefore an
institution row must be created **with the correct locks, by an authorized path.** This
is why we scaffold (below) rather than hope rows appear with the right flags.

## Recommended design: registry-driven institution scaffolding

Make the institution the authoritative owner of these defaults by **seeding an
institution-scope row per institution-managed setting when the institution is created**,
with the correct locks, driven declaratively from the registry. The registry `default`
stays as the ultimate fallback (defense for any un-scaffolded class).

Why this over alternatives:
- **Institution-owned, editable defaults.** Rows exist with `allow_admin_edit = true` and
  `allow_child_override = true`, set by the super-admin-gated create path — so
  institution admins can manage their own default *and* do class overrides, with no
  first-write lock-out trap and no institution admin self-granting `allow_admin_edit`.
- **Robust & explicit.** Behavior doesn't depend on subtle resolver/trigger interactions
  at materialization time; every institution has an auditable row.
- **Extensible & uniform.** Seeding is generated from the registry, so a future setting
  is one registry entry (see recipe) and every institution scaffolds it identically.
- **Tradeoff:** each institution's value is a snapshot, so changing the registry
  `default` later does not retro-apply to already-scaffolded institutions. That is the
  intended "each institution owns its config" semantics; the registry `default` remains
  the fallback for anything not yet scaffolded.

### Framework addition: `institutionScaffold`

Extend `SettingDefinition` with an optional descriptor:

```ts
interface InstitutionScaffold<TValue> {
  /** Seeded institution value. Defaults to the registry `default` when omitted. */
  value?: TValue;
  /** Institution admins may edit the institution value. */
  allowAdminEdit: boolean;
  /** Classes may override (class admins bypass via classOverrideAdminOnly anyway). */
  allowChildOverride: boolean;
}
// SettingDefinition gains:  institutionScaffold?: InstitutionScaffold<TValue>;
```

Then a single registry-driven helper builds the seed rows:

```ts
// src/lib/settings/scaffold.ts
export function buildInstitutionScaffoldRows(institutionId: string, userId: string) {
  return Object.values(SETTINGS_REGISTRY)
    .filter((d) => d.institutionScaffold)
    .map((d) => ({
      scope: "institution", scope_id: institutionId, key: d.key,
      value: d.institutionScaffold!.value ?? d.default,
      allow_admin_edit: d.institutionScaffold!.allowAdminEdit,
      allow_child_override: d.institutionScaffold!.allowChildOverride,
      updated_by: userId,
    }));
}
```

Wire-in points:
- **On create:** [createInstitution](../src/lib/queries/institutions.ts) is called by the
  super-admin-gated [createInstitutionAction](../src/app/platform/actions.ts). Insert the
  scaffold rows right after the institution insert, in the same action (runs as super
  admin ⇒ trigger permits setting the locks). Also cover the default institution created
  in [seed.sql](../supabase/seed.sql).
- **Backfill existing institutions:** idempotent one-time script under `scripts/`
  (`insert … on conflict (scope, scope_id, key) do nothing`) so it never clobbers a
  customized row. Only a handful of institutions exist today.

> Lighter alternative considered — make `DEFAULT_LOCKS` registry-declared (no seeding, so
> the registry value stays DRY with no drift). Rejected as the primary approach because
> the first time an institution admin writes a value, the new row's lock columns fall back
> to the DB default `false`, re-locking them and blocking class overrides — avoiding that
> requires the upsert to self-set `allow_admin_edit = true`, which quietly breaks the
> "only super admin controls `allow_admin_edit`" invariant. Scaffolding sets the locks
> once, cleanly, via an authorized path.

## The two settings

### 1. Allowed Content Types (`allowed_content_types`, `type: "string_array"`)

```ts
export const CONTENT_TYPE_OPTIONS = [
  { value: "formative_assignment", label: "Activity" },
  { value: "learning_content",     label: "Content" },
  { value: "quiz",                 label: "Quiz" },
  { value: "survey",               label: "Survey" },
] as const;

const allowedContentTypes: SettingDefinition<string[]> = {
  key: "allowed_content_types",
  label: "Allowed content types",
  description: "Content types teachers can create. Quiz and Survey are off by default.",
  category: "Content",
  scopes: ["institution", "class"],
  type: "string_array",
  options: CONTENT_TYPE_OPTIONS,
  default: ["formative_assignment", "learning_content"], // Quiz & Survey off
  validate: /* whitelist to option values, dedupe, keep option order */,
  clamp: (child, parent) => child.filter((v) => parent.includes(v)), // class ⊆ institution
  classOverrideAdminOnly: true,
  institutionScaffold: { allowAdminEdit: true, allowChildOverride: true },
};
```

- Content-type ids (`formative_assignment`, `quiz`, `survey`, `learning_content`) match
  those already used in [Content.tsx](../src/components/Teacher/Classes/Content.tsx) and
  the create routes.
- `string_array` renders as the built-in checkbox group, which already greys out options
  the parent (institution) disallows — the class override UI is free.
- `clamp` guarantees a class can never re-enable a type the institution turned off.

**Enforcement — creation only (existing content stays visible):**
- Primary: [CreateContentMenu.tsx](../src/components/Teacher/Classes/ContentParts/CreateContentMenu.tsx)
  (currently hard-codes all four items) renders only permitted items, driven by the
  server-resolved `allowedContentTypes` prop (see "Loading strategy" below) — **not** a
  client fetch, so there is no flash of Quiz/Survey before they're filtered out.
- Defense-in-depth: the create route pages (`.../quizzes/create`, `.../surveys/create`,
  `.../assignments/create`, `.../learning-content/create`) resolve the effective setting
  server-side and redirect if the type is disallowed. Hiding a menu item is not
  authorization.

### 2. Students Analytics tab (`show_students_analytics_tab`, `type: "boolean"`)

```ts
const showStudentsAnalyticsTab: SettingDefinition<boolean> = {
  key: "show_students_analytics_tab",
  label: "Show Students → Analytics tab",
  description: "When on, the Analytics sub-tab is available inside a class's Students tab.",
  category: "Views",
  scopes: ["institution", "class"],
  type: "boolean",
  default: false, // hidden by default
  validate: validateBoolean,
  classOverrideAdminOnly: true,
  institutionScaffold: { allowAdminEdit: true, allowChildOverride: true },
};
```

**Enforcement:** [Students.tsx](../src/components/Teacher/Classes/Students.tsx)
- Consume the server-resolved `showAnalyticsTab` prop (see "Loading strategy") — no
  client fetch, so the tab never appears-then-vanishes on first paint.
- Conditionally render the `analytics` tab trigger (~line 580) and its `TabsContent`
  (~line 647).
- Guard `activeStudentsTab` (~line 102): if the URL says `studentsTab=analytics` but the
  tab is hidden, fall back to `info` — mirror the `showAiTab` fallback in
  [ClassSettingsClient.tsx](../src/app/teacher/classes/[classId]/settings/ClassSettingsClient.tsx#L153).
- Skip `ensureProgressDataLoaded()` for analytics when hidden.
- Note: the class-*settings* "Analytics and Logs" (AI usage) tab is a separate thing
  gated by `showAiTab`; untouched.

Both settings already surface, with zero extra UI code, in the institution Settings tab
(`scopes` includes `institution`) and the class override section (`scopes` includes
`class`, `classOverrideAdminOnly: true`).

### Loading strategy — resolve server-side, pass as props (no flash)

The class detail page [page.tsx](../src/app/teacher/classes/[classId]/page.tsx) is
already a server component that fetches `classData`. Resolve the effective class settings
**there**, in the same server render, and thread the two derived values down as props —
never via a client `useEffectiveClassSettings` fetch on this page.

- In `page.tsx`: `const effective = await getEffectiveSettingsForClass(supabase, classData.id);`
  then compute `allowedContentTypes = getEffectiveValue(effective, "allowed_content_types")`
  and `showAnalyticsTab = getEffectiveValue(effective, "show_students_analytics_tab")`.
- Pass both into `ClassDetailClient`, which forwards `allowedContentTypes` → `Content` →
  `CreateContentMenu`, and `showAnalyticsTab` → `Students`.
- Cost: this folds into the render the page already performs — ~2 extra indexed queries
  on the tiny `setting_values` table (institution + class rows fetched in parallel; PK
  `(scope, scope_id, key)` + `setting_values_scope_idx`). No client round trip, no flash,
  correct on first paint. Wrap the class-data + settings loads together in the existing
  `cache()`/`getClassData` pattern if convenient.

The **class Settings page** and **institution Settings page** keep using the SWR hooks
(`useEffectiveClassSettings` / `useEffectiveInstitutionSettings`) — those are live editing
surfaces that need client-side revalidation after a mutation; a momentary loading state
there is expected and fine. The no-flash rule applies specifically to the class *detail*
page where the gate must be right on first paint.

## Extensibility recipe — "add a future institution-default class setting"

1. Append one `SettingDefinition` to `SETTINGS_REGISTRY`:
   - `scopes: ["institution", "class"]`, a `default` (shipped fallback value),
     `validate` (+ `clamp` for `string_array`).
   - `classOverrideAdminOnly: true` if only admins may override per class (else `false`).
   - `institutionScaffold: { allowAdminEdit, allowChildOverride, value? }` to make it
     institution-owned and editable from day one.
2. Nothing else. Institution UI, class-override UI, resolution, write enforcement, and
   seeding all read from the registry. New institutions scaffold automatically; run the
   idempotent backfill once for existing ones.

Worth adding a short `dev-docs/adding-hierarchical-settings.md` capturing this recipe.

## Implementation steps

1. **registry.ts** — add the `InstitutionScaffold` type + `institutionScaffold` field,
   `CONTENT_TYPE_OPTIONS`, a `validateStringArray(options)` helper, and the two entries.
2. **scaffold.ts** — `buildInstitutionScaffoldRows()` (registry-driven).
3. **Institution create + backfill** — call the scaffold from
   [createInstitutionAction](../src/app/platform/actions.ts) / `createInstitution`; cover
   [seed.sql](../supabase/seed.sql); add an idempotent `scripts/` backfill for existing
   institutions.
4. **page.tsx (server) → props** — resolve `getEffectiveSettingsForClass` in the class
   detail RSC and thread `allowedContentTypes` + `showAnalyticsTab` through
   `ClassDetailClient` to `Content`/`Students` (see "Loading strategy"). No client fetch
   on this page ⇒ no flash.
5. **CreateContentMenu.tsx / Content.tsx** — gate the create items by the `allowedContentTypes` prop.
6. **Create-route guards** — server-side redirect for disallowed types (defense-in-depth).
7. **Students.tsx** — conditionally render the Analytics tab from the `showAnalyticsTab`
   prop + URL fallback + skip preload.
8. **Tests** — unit-test `validateStringArray` / `clamp` (class ⊆ institution) and
   `buildInstitutionScaffoldRows`.

## Decisions

1. **Institution-managed defaults — CONFIRMED.** Scaffold with `allowAdminEdit: true` so
   **institution admins** manage their own institution default (and do class overrides).
2. **Drift is acceptable — CONFIRMED.** Changing a registry `default` later does not
   retro-apply to already-scaffolded institutions; each institution owns its config.
3. **Creation-only gating** for content types (existing items remain visible/editable) —
   academic today since nothing is created yet, but it's the long-term behavior.
4. **Category labels** `Content` / `Views` for `SettingsList` grouping — confirm naming
   (minor; can adjust during build).

## Out of scope

- No change to how quizzes/surveys/assignments render or evaluate; no hiding/deleting of
  existing content. The class-settings "Analytics and Logs" (AI usage) tab is untouched.

## Note on the class-teacher DB gap (pre-existing)

With `allow_child_override = true` on the institution row, the generic
`setting_values_enforce_locks` trigger would permit a class *teacher* (who passes
`can_configure_class`) to write a class override at the DB level; `classOverrideAdminOnly`
keeps them out only at the app layer, since all writes funnel through the server actions
in [actions.ts](../src/lib/settings/actions.ts). This is an existing characteristic of the
framework (shared by `enable_bulk_feedback_approval`), not introduced here. If strict
DB-level enforcement is later wanted, the trigger would need to learn about
`classOverrideAdminOnly`.
