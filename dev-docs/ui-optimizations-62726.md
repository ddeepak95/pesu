# UI/UX Optimizations — 2026-06-27

Implementation plan for a batch of UI/UX cleanups plus a public-submission completion bug.
Tasks are independent and can be shipped/PR'd separately.

---

## 1. `/try` page light/dark mode handling

**Problem:** The `/try` page does not render correctly in dark mode. Forcing it to
always render in light mode is acceptable.

**Current state:** `src/app/try/page.tsx` already forces light mode imperatively in a
`useEffect`: it sets `html.style.colorScheme = "light"` and overrides `--canvas` /
`--grain-opacity`, restoring the previous values on unmount. The gap is that this only
overrides a few CSS variables — child components (cards, navbar, buttons) still read
`.dark`-scoped tokens if a `dark` class is present on `<html>`, and there is a
flash-of-dark before the effect runs on first paint.

**Approach:**
- Wrap the page content in a container that hard-pins the light palette rather than
  relying on variable overrides. Preferred: add the `light` class (and remove `dark`)
  on the page wrapper, or render the whole tree inside an element with
  `data-theme="light"` / `className="light"` so every descendant token resolves to the
  light scheme. Confirm how the theme is applied globally first (check the root layout /
  theme provider and `globals.css` for `.dark` vs `:root` token definitions).
- Move the override so it applies before first paint where possible (set the class in
  the same effect but also give the wrapper static light-mode utility classes so there
  is no flash). If a theme provider is used, the cleanest fix is to force-scope this
  route to light via that provider instead of mutating `html.style`.
- Verify `LandingNavbar` and `Card`/`Button` inside the page also resolve correctly
  under the forced-light scope (they currently inherit from `<html>`).

**Files:**
- `src/app/try/page.tsx`
- (read-only) root layout + `globals.css` / theme provider to confirm token scoping

**Acceptance:**
- `/try` renders identically regardless of system/app theme, with no flash-of-dark on
  load and correct restoration when navigating away.

---

## 2. Reusable "collapsible" tab bar (hide when only one tab)

**Problem:** Tab bars render even when there is only a single tab, wasting vertical
space. This affects the assignment Submissions tab and the class Content group tabs
(tasks 3 & 4). The user wants this behavior to be **modular and config-driven**, not
hand-rolled at each call site.

**Approach (do this first — tasks 3 & 4 consume it):**
- Add a reusable wrapper around `MutedPrimaryTabsList` in
  `src/components/Teacher/Shared/MutedPrimaryTabs.tsx` that hides itself (renders
  `null`, contributing no margin/padding) when it contains ≤ 1 visible
  `MutedPrimaryTabsTrigger`.
- Implementation: count valid React children (`React.Children.toArray(children)` filtered
  to truthy elements). If `count <= 1`, return `null`; otherwise render the existing
  `MutedPrimaryTabsList` with its children. This keeps Radix `Tabs` working — the single
  tab's `TabsContent` still renders via its `value`/`defaultValue`; only the visual tab
  strip is removed.
- Keep it opt-in via a prop so existing call sites are unaffected, e.g.
  `<MutedPrimaryTabsList hideWhenSingle>` or a sibling component
  `CollapsibleMutedPrimaryTabsList`. Prefer a prop on the existing component to avoid a
  second export.
- Ensure the wrapper does not apply the `mb-4` / padding when hidden (callers currently
  put spacing classes on the list itself — when it returns `null`, that spacing
  correctly disappears).

This satisfies the [[feedback_modular_components]] preference (reusable shell + config,
not inlined conditionals at each site).

**Files:**
- `src/components/Teacher/Shared/MutedPrimaryTabs.tsx`

**Acceptance:**
- A `MutedPrimaryTabsList` with `hideWhenSingle` and one trigger renders nothing and
  occupies no space; with two+ triggers it renders normally.

---

## 3. Submissions tab bar: hide "Class Students / Public Submissions" strip when only one tab

**Problem:** On the assignment submissions view
(`/teacher/classes/[classId]/assignments/[assignmentId]?tab=submissions`), the
"Class Students" / "Public Submissions" tab strip shows even when the assignment is not
public — i.e. only "Class Students" exists. The strip should not show in that case.

**Current state:** The **live** component is
`src/components/Teacher/Assignments/SubmissionsListSection.tsx` (imported by
`AssignmentDetailClient.tsx`). The "Public Submissions" trigger is already gated behind
`isPublic`, so when `isPublic === false` there is exactly one trigger but the strip
still renders.

> Note: `src/components/Teacher/Assignments/SubmissionsTab.tsx` is a near-identical copy
> that is **not** imported anywhere (dead/legacy). Confirm with a usage search and, if
> truly unused, delete it as part of this task rather than editing it twice. If kept,
> apply the same change.

**Approach:**
- Swap the `MutedPrimaryTabsList` in `SubmissionsListSection.tsx` (line ~606) to the new
  collapsible variant from task 2 (`hideWhenSingle`). With the Public trigger gated on
  `isPublic`, the strip auto-hides when not public.
- Verify `defaultValue="class-students"` still selects the correct content when the strip
  is hidden (it does — Radix uses the value, not a rendered trigger).

**Files:**
- `src/components/Teacher/Assignments/SubmissionsListSection.tsx`
- (cleanup) `src/components/Teacher/Assignments/SubmissionsTab.tsx` — delete if unused

**Acceptance:**
- Non-public assignment: no tab strip above the submissions table.
- Public assignment: both tabs show as today.

---

## 4. Class Content: hide group tab strip when only one group; move options menu

**Problem (4a):** On the class content page
(`/teacher/classes/[classId]?tab=content`), the group tab strip shows even when the
class has only one group. It should not show in that case.

**Problem (4b):** The options (`⋮` / `MoreVertical`) dropdown currently sits in the
group-tabs row. It should move up into the header row, immediately to the **left** of the
Create button.

**Current state:** `src/components/Teacher/Classes/Content.tsx`:
- Header row (lines ~514–523): title + `CreateContentMenu`.
- Group tabs row (lines ~580–611): `MutedPrimaryTabsList` of groups + the `⋮`
  `DropdownMenu` (rendered when `!selectionMode && items.length > 0`).

**Approach:**
- **4a:** Replace the groups `MutedPrimaryTabsList` (line ~581) with the collapsible
  variant (`hideWhenSingle`) from task 2. When `groups.length <= 1`, the strip hides.
  The existing `Tabs value={selectedGroupId}` logic and per-group `TabsContent` continue
  to work since the active group is selected by value, not by a rendered trigger.
- **4b:** Move the `⋮` `DropdownMenu` block out of the tabs row and into the header
  `<div className="flex items-center gap-2">` (line ~517), placed **before**
  `CreateContentMenu`. Keep its existing visibility condition
  (`!selectionMode && items.length > 0`).
- After moving the dropdown out, the wrapping `<div className="mb-4 flex items-center
  justify-between gap-4">` around the tabs row no longer needs `justify-between` (only
  the tab list remains). Simplify it; and when the strip is hidden it should collapse to
  no extra vertical space. Confirm the selection-mode toolbar (lines ~525–569) spacing
  still looks right since the options menu now lives in the header.

**Files:**
- `src/components/Teacher/Classes/Content.tsx`

**Acceptance:**
- Single-group class: no group tab strip; options menu sits just left of Create in the
  header.
- Multi-group class: group strip shows as today; options menu is in the header (not in
  the tabs row).
- Bulk select/duplicate/delete still work after the move.

---

## 5. Public Submissions: mark complete on finish + show a "Finished" state

**Problem:** When a respondent completes a **public** assignment (via `/assignment/[id]`)
and clicks Finish, the submission is never marked complete:
- The teacher's Public Submissions table keeps showing it as "In Progress".
- The respondent gets no clear "Finished" confirmation banner.

**Root cause:** Completion status is derived in
`src/lib/queries/submissions.ts` from `submission.status === "completed"`
(`getPublicSubmissionsByAssignment`, line ~907; same for class students, line ~852).
The only place that sets `status: "completed"` is `completeSubmission()` (line ~281),
which is called from `AssessmentNavigation.performCompletion()` (line ~200) — **but that
whole path is gated on `contentItemId`**:

```ts
// AssessmentNavigation.handleConfirmFinish (~line 164)
if (!contentItemId) { if (onNext) onNext(); return; }
...
const performCompletion = async (...) => {
  if (!contentItemId) return;   // <-- public has no contentItemId → never completes
  ...
  await completeSubmission(submissionId);
  await markContentAsComplete(contentItemId);
}
```

Public assignments have **no content item** (content items are a class-content concept),
so `contentItemId` is null/undefined and the submission status is never written. The
`isComplete` flag (from `useIsContentComplete(contentItemId)`) is also always false for
public, so the "All questions completed" banner in `QuestionCompletionPanel` never shows.

**Approach:** Decouple "mark the submission complete" from "mark the content item
complete". The content-item completion stays gated on `contentItemId`; the submission
status update should happen for **all** finishes.

In `src/components/Shared/AssessmentNavigation.tsx`:
- In `handleConfirmFinish`, stop early-returning when `!contentItemId`. Instead, route
  through `performCompletion()` so the submission gets marked complete. (Preserve the
  experience-rating branch if `experienceRatingEnabled` — decide whether public flows
  enable rating; if not, it simply proceeds.)
- In `performCompletion`, change the guard so it does not bail on missing
  `contentItemId`:
  - Always call `completeSubmission(submissionId)` when `submissionId` is present.
  - Only call `markContentAsComplete(contentItemId)` + `invalidateCompletionsCache()`
    when `contentItemId` is truthy.
  - Keep the success toast / dialog close / `onMarkedComplete` / `onNext` behavior.

In the public completion UI (`src/components/Public/PublicAssignmentResponse.tsx` +
`AssignmentResponseCore` / `QuestionCompletionPanel`):
- Drive the "Finished" state for public from the submission's own `status === "completed"`
  rather than from `useIsContentComplete(contentItemId)` (which is content-item-only).
  Plumb an `isComplete` signal that is true when the submission status is completed, so
  `QuestionCompletionPanel` shows its completed banner (line ~202) and the Finish button
  flips to its disabled "Completed" state (`FinishAssessmentButton`).
- The existing `phase === "completed"` branch in `PublicAssignmentResponse` (line ~445)
  already renders a completion view and session-restore already treats
  `status === "completed"` as completed (line ~169) — once `completeSubmission` actually
  runs, restoring a finished public submission will correctly land in the completed
  phase. Add/confirm a clear "Finished — thanks for your response" banner here so the
  respondent gets explicit confirmation (the current completed view is thin).

**Files:**
- `src/components/Shared/AssessmentNavigation.tsx` (core fix: persist completion without a
  content item)
- `src/components/Public/PublicAssignmentResponse.tsx` (completed-phase banner)
- `src/components/Shared/AssignmentResponseCore.tsx` /
  `src/components/Shared/QuestionCompletionPanel.tsx` (drive `isComplete` from submission
  status for public)
- (read-only) `src/lib/queries/submissions.ts` — confirms status-derived completion;
  no change needed.

**Acceptance:**
- A respondent finishes a public assignment → submission `status` becomes `completed`
  in the DB.
- Respondent sees an explicit "Finished" banner/confirmation; the Finish button shows
  "Completed" and the completed state survives a page refresh (session restore).
- Teacher's Public Submissions table shows the row as "Completed" (task 5b).
- Class (non-public) finish flow is unchanged: still marks both the submission and the
  content item complete.

**Watch out for:**
- Don't regress the class flow — `markContentAsComplete` must still run when
  `contentItemId` exists.
- Confirm whether experience-rating should appear for public finishes; if
  `experienceRatingEnabled` is false for public, the direct-completion path is correct.
- Idempotency: finishing/refreshing shouldn't error if `completeSubmission` is called on
  an already-completed submission (the update is a simple status write — safe to repeat).

---

## Suggested sequencing

1. Task 2 (reusable collapsible tab list) — unblocks 3 & 4.
2. Tasks 3 & 4 (consume the collapsible list) — independent UI cleanups.
3. Task 1 (`/try` light mode) — independent.
4. Task 5 (public completion) — independent; the highest-value functional fix.
