# Students Tab — Unified Table + Persistable Table Config

> **Status: IMPLEMENTED (2026-07-18, branch `ui-fixes-new`).** Verified via
> `tsc --noEmit` + `eslint` (repo has no test runner). No DB migration —
> `progress_view_config` already stores arbitrary JSON; the resolver defaults
> cover legacy rows. New files: `studentsTableConfig.ts`,
> `StudentsTableConfigMenu.tsx`. `StudentProgressDialog.tsx` is now an orphan
> (was already dead code behind `{false && …}`) and left in place.

## Goal

Collapse the Students tab's separate **Info** and **Progress** sub-tabs into **one
unified roster table** driven by a persistable **Table Config**. The config decides
which columns render *and* which per-student data is fetched, so we never pull
progress/approval data unless a column that needs it is enabled — cutting DB egress
and unnecessary fetching.

**Analytics** sub-tab is unaffected (it stays gated by the institution-default
`showAnalyticsTab`; see [institution-default-class-settings-plan.md](./institution-default-class-settings-plan.md)).

## Requirements (from request)

1. Merge Info + Progress functionality into a single table.
2. Add a **Table Config** control to choose which columns show. Config is
   **persistable** and **fetch-aware** — only data needed by enabled columns is fetched.
3. Move Progress's **"View Details"** button into the row-wise menu as **"View Progress"**.
4. **Group** column: shown only when relevant. When the class has exactly **one group**,
   hide Group both from the table *and* from the Table Config (nothing to choose).
5. **Progress bar**, **Last completed**, and **Approvals** are **hidden by default**,
   opt-in via Table Config.
6. Each Table Config item carries an **info tooltip** explaining what it means.

## Decisions (confirmed)

- **Config scope:** per-class, in the existing DB-backed
  [`progress_view_config`](../src/types/class.ts) (already loaded with the `Class` row —
  zero extra fetch; shared across co-teachers). We extend that JSON, not a new table.
- **Config governs all columns**, including profile-field columns (today set in
  Settings → Profile Fields). Table Config reads/writes the *same* `progress_view_config`,
  so the Settings page and the Students tab stay in sync.

## Current state (what we're merging)

- [Students.tsx](../src/components/Teacher/Classes/Students.tsx) renders three sub-tabs
  (`info` / `progress` / `analytics`) via `studentsTab` URL param. Info and Progress each
  build their own `SubmissionsTable` (`tableColumns`/`tableRows` vs
  `progressTableColumns`/`progressTableRows`) — largely duplicated profile + group column
  logic, plus a dead `View progress` ghost button (`{false && …}`, lines ~255-265) and a
  standalone `View details` button column (lines ~439-457).
- [useClassStudentsData.ts](../src/components/Teacher/Classes/hooks/useClassStudentsData.ts)
  fetches base data always (students, groups, profile fields, profiles, saved config) and
  **progress data lazily** — `progressEnabled` flips true via `ensureProgressDataLoaded()`
  when the Progress/Analytics tab opens, which fires **both**
  `useClassStudentProgressSummary` (the `get_class_student_progress_summary` RPC) **and**
  `useStudentIdsPendingApprovalsByClass`.
- Persistence: [`getProgressViewConfig`/`saveProgressViewConfig`](../src/lib/queries/classes.ts)
  read/write `classes.progress_view_config` (`{ display_fields, filter_fields }`). Config is
  authored today in [ProfileFieldsSection.tsx](../src/components/Teacher/Classes/Settings/ProfileFieldsSection.tsx).

The lazy split is the seed of the egress optimization — we make it **per-column** instead
of **per-tab**.

## Design

### 1. Extend the config type

[src/types/class.ts](../src/types/class.ts):

```ts
export interface ProgressViewColumnConfig {
  /** Group column. Omitted/undefined => auto (shown iff class has >1 group). */
  group?: boolean;
  /** Progress bar (completed/total). Default false. */
  progress?: boolean;
  /** Last completed date. Default false. */
  last_completed?: boolean;
  /** Pending approvals badge. Default false. */
  approvals?: boolean;
}

export interface ProgressViewConfig {
  display_fields: string[];   // existing — profile fields shown as columns
  filter_fields: string[];    // existing — profile fields offered as filter dropdowns
  columns?: ProgressViewColumnConfig;  // NEW — built-in column visibility
}
```

Backward compatible: existing rows have no `columns` → all three heavy columns default
off (matches requirement 5), Group auto by group count.

A single **defaults resolver** turns the stored config + group count into resolved
booleans, so the table, the fetch gates, and the config UI all agree:

```ts
// new: src/components/Teacher/Classes/studentsTableConfig.ts
export interface ResolvedColumnVisibility {
  group: boolean;        // group.count > 1 && (columns.group ?? true)
  progress: boolean;     // columns.progress ?? false
  lastCompleted: boolean;// columns.last_completed ?? false
  approvals: boolean;    // columns.approvals ?? false
}
export function resolveColumnVisibility(
  cfg: ProgressViewConfig | null,
  groupCount: number,
): ResolvedColumnVisibility;

// Whether any enabled column needs each lazy dataset:
export const needsProgressSummary = (v) => v.progress || v.lastCompleted;
export const needsPendingApprovals = (v) => v.approvals;
```

Column metadata (label + tooltip copy) also lives here so the table header and the
config popover share one source:

```ts
export const STUDENT_COLUMN_META = {
  group:        { label: "Group",          tip: "The class group each student is assigned to." },
  progress:     { label: "Progress",       tip: "Share of assigned content items each student has completed (completed / total for their group)." },
  lastCompleted:{ label: "Last completed", tip: "Date the student most recently completed a content item." },
  approvals:    { label: "Approvals",      tip: "Flags students with an assignment awaiting your approval." },
} as const;
```

### 2. Fetch-aware data hook (the egress win)

In [useClassStudentsData.ts](../src/components/Teacher/Classes/hooks/useClassStudentsData.ts),
replace the single boolean `progressEnabled` (all-or-nothing, tab-driven) with **two
independent gates derived from the resolved config**:

- `needsProgressSummary(visibility)` → enables `useClassStudentProgressSummary`.
- `needsPendingApprovals(visibility)` → enables `useStudentIdsPendingApprovalsByClass`.

Effect:
- Default roster (no heavy columns on) fetches **neither** the progress RPC nor the
  approvals query — a strict reduction vs. today, where opening Progress fired both.
- Enabling only "Last completed" fetches the summary RPC but **not** approvals.
- Enabling only "Approvals" fetches approvals but **not** the summary RPC.

The config is available synchronously (it rides on the `Class` row / is already SWR-cached),
so gates resolve on first render — no fetch-then-hide waterfall. `ensureProgressDataLoaded`
and the tab-based `useEffect` in Students.tsx are removed; gating is now purely config-driven.

Expose `progressSummaryLoading` / `approvalsLoading` separately so the table shows a spinner
only in the columns actually loading.

> **Note — profile JSON:** `useAllStudentProfiles` returns the whole `field_responses`
> JSON per student regardless of which profile columns are visible. Column-level scoping of
> a single JSON blob isn't worth it; `display_fields` already controls *rendering*. Out of
> scope for this pass. The material egress win is gating the two heavy per-student queries above.

### 3. One unified table

Collapse `tableColumns`/`progressTableColumns` into a **single `columns` builder** in
Students.tsx that appends columns conditionally from `resolveColumnVisibility`:

Column order: `Name` (identity, always) → visible **profile-field** columns (`display_fields`)
→ `Group` (if resolved on) → `Progress` (if on) → `Last completed` (if on) → `Approvals`
(if on) → `Actions` (always, right-aligned).

- Reuse the existing cell renderers verbatim (progress bar, last-completed date, approvals
  badge) — just move them behind the visibility flags.
- One `rows` builder producing the superset row shape (`progressStats`, `hasPendingApprovals`,
  `_student`, `_groups`) already used by the Progress table.
- `statusFilterOptions` (All Complete / In Progress / Not Started) is only meaningful when a
  progress-bearing column is on → pass it only when `needsProgressSummary(visibility)`.
- Delete the sub-tab `<Tabs>` for info/progress; keep the top-level Students/Analytics split.
  URL param simplifies: drop `studentsTab=progress`; keep `studentsTab=analytics`.

### 4. Row menu: "View Progress"

- Add `onViewProgress` to
  [StudentListItemMenu.tsx](../src/components/Teacher/Classes/StudentListItemMenu.tsx) as a
  new `DropdownMenuItem` ("View Progress", e.g. `LineChart`/`BarChart` icon), placed above
  Change Group.
- Wire it to the existing `handleViewIndividualProgress` →
  [StudentIndividualProgressDialog](../src/components/Teacher/Classes/StudentIndividualProgressDialog.tsx).
- Delete the standalone `View details` button column and the dead `{false && …} View progress`
  ghost button.

### 5. Table Config UI

A **"Configure"** button in the table toolbar (`toolbarEndExtra`, next to the CSV download),
opening a popover of checkboxes titled **Table settings**:

- **Profile fields** section — one checkbox per profile field (writes `display_fields`).
- **Details** section — Group (only if `groupCount > 1`), Progress, Last completed, Approvals
  (writes `columns.*`).
- **Filters** section — one checkbox per dropdown-type profile field (writes `filter_fields`);
  checked fields appear as filter dropdowns in the toolbar. This config was **moved out of
  Settings → Profile Fields** ("Filter in Views" removed there) so filtering is configured
  where it's used. Settings still edits "Display in Views" (`display_fields`) and now
  **preserves** `filter_fields`/`columns` instead of clobbering them.
- Each row has an **info tooltip** (ⓘ) with `STUDENT_COLUMN_META[...].tip`. For profile
  fields, tip = the field's own description/name.
- **Group is omitted entirely when the class has ≤1 group** (requirement 4).

Persistence: on change, build the full `ProgressViewConfig` and call `saveProgressViewConfig`
(reuse as-is), then `progressViewQuery.mutate()` / update the SWR cache so the table and fetch
gates react immediately. Because save is class-level, co-teachers share the layout.

Reuse the existing multi-select popover pattern (see
[ClassStudentsCsvExportDialog](../src/components/Teacher/Classes/ClassStudentsCsvExportDialog.tsx)
column-picker and the `ProfileFieldFilters` popover in
[SubmissionsTable](../src/components/Teacher/Shared/SubmissionsTable.tsx)) rather than a new
primitive — per the modular-components preference.

### 6. CSV export

The two export dialogs (info CSV, progress CSV) collapse to **one** "Download (CSV)" whose
columns mirror the currently-visible table columns (via the same visibility resolver +
`get*CsvColumnOptions` in
[classStudentsCsvColumns.ts](../src/components/Teacher/Classes/classStudentsCsvColumns.ts)).
Progress/last-completed/approvals CSV columns are offered only when those table columns are on.

## Files touched

| Concern | File | Change |
|---|---|---|
| Config type | [src/types/class.ts](../src/types/class.ts) | Add `columns` to `ProgressViewConfig` |
| Resolver + column meta | `src/components/Teacher/Classes/studentsTableConfig.ts` | **New** — visibility resolver, fetch-gate predicates, tooltip copy |
| Data hook | [useClassStudentsData.ts](../src/components/Teacher/Classes/hooks/useClassStudentsData.ts) | Replace `progressEnabled` with per-dataset gates; expose per-dataset loading |
| Main component | [Students.tsx](../src/components/Teacher/Classes/Students.tsx) | Merge tables, one column builder, remove info/progress sub-tabs, add Columns config, single CSV |
| Row menu | [StudentListItemMenu.tsx](../src/components/Teacher/Classes/StudentListItemMenu.tsx) | Add "View Progress" item |
| Config UI | `src/components/Teacher/Classes/StudentsTableConfigMenu.tsx` | **New** — columns popover with tooltips |
| CSV | [classStudentsCsvColumns.ts](../src/components/Teacher/Classes/classStudentsCsvColumns.ts) | Column options honor visibility |
| Persistence | [classes.ts](../src/lib/queries/classes.ts) | None — `save/getProgressViewConfig` already handle the extended JSON |

No DB migration (JSON column already stores arbitrary shape; resolver defaults cover legacy rows).

## Implementation steps

1. Extend `ProgressViewConfig` with `columns`.
2. Add `studentsTableConfig.ts` (resolver, gate predicates, `STUDENT_COLUMN_META`).
3. Rework `useClassStudentsData` to gate the two heavy queries independently on the resolved
   visibility; expose separate loading flags; remove `ensureProgressDataLoaded`.
4. Merge Students.tsx into one table + one rows/columns builder honoring visibility; remove
   info/progress sub-tabs and `studentsTab=progress`.
5. Build `StudentsTableConfigMenu` (checkboxes + ⓘ tooltips; omit Group when ≤1 group);
   persist via `saveProgressViewConfig` + cache update.
6. Add "View Progress" to `StudentListItemMenu`; delete the standalone button + dead ghost button.
7. Collapse the two CSV dialogs into one honoring visible columns.
8. Verify: `tsc --noEmit` + `eslint`. Manually confirm (a) default roster fires **no**
   progress/approval network calls (DevTools), (b) enabling only "Last completed" fetches the
   summary RPC but not approvals, (c) single-group class hides Group everywhere, (d) config
   persists across reload and is shared with a co-teacher account.

## Egress summary

| Scenario | Progress RPC | Approvals query |
|---|---|---|
| Default roster (heavy cols off) | ❌ not fetched | ❌ not fetched |
| Progress and/or Last completed on | ✅ fetched | ❌ |
| Approvals on | ❌ | ✅ fetched |
| All on | ✅ | ✅ |

Today, simply opening the Progress tab fetched **both** unconditionally; the unified,
config-gated table fetches each only when a column needs it.
