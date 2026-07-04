# Meaningful browser-tab titles & social-sharing metadata

## Context

Right now the only `<title>` defined anywhere is a single static one in the root
layout (`${toolName} | Voice-based AI Assistant for Learning`). A handful of
admin/platform/template pages override it with a plain static string, but every
assignment, quiz, survey, learning-content, and class page — plus most
dashboards, login screens, and the publicly-shareable assignment link — shows
either the generic root title or nothing distinguishing at all. The publicly
shareable assignment link (`/assignment/[assignmentId]`) also has no Open
Graph/Twitter tags, so pasting it into Slack/iMessage/etc. produces a
meaningless preview. The goal: every page gets a title that actually describes
what's on screen (e.g. "Homework 3 — Chapter 5 Reading | ConvoEd" instead of
just "ConvoEd"), and the public share link gets real social-preview metadata.

Next.js 16 App Router is in use throughout (`src/app/**`), no `next/head`
anywhere, no `generateMetadata` anywhere yet. Two existing patterns will host
almost all of this work:

- **Server-component detail pages** already fetch the record they render
  (e.g. `teacher/classes/[classId]/assignments/[assignmentId]/page.tsx` selects
  `assignments.*` via `verifySession()`'s Supabase client, then passes it to a
  client child like `AssignmentDetailClient`). These just need a
  `generateMetadata` added alongside the existing fetch.
- **Client-only pages** (`'use client'` at the top — 18 of them, including the
  public assignment share page) cannot export metadata themselves. For these
  we add a small sibling `layout.tsx` (a Server Component) in the same route
  segment that supplies `generateMetadata`, without touching the existing
  client page's logic at all. The 4 "edit" pages (assignment/quiz/survey/
  learning-content) get a **static** title this way (e.g. "Edit Assignment")
  rather than a per-record dynamic one — fetching the record's title just for
  the edit-page tab isn't worth the extra query/complexity here.

## 0. Save this plan to `dev-docs/`

The project keeps design/plan docs under `dev-docs/` (e.g.
`activity-templates-plan.md`, `multimodal-orchestration-plan.md`). As the
first step of implementation, save a copy of this plan to
`dev-docs/page-titles-and-social-metadata-plan.md` so it's discoverable
alongside the other plan docs (the `.claude/plans/` copy is transient/local).

## 1. Foundation — root layout (`src/app/layout.tsx`)

- Switch `metadata.title` to a template so every child title automatically
  gets the brand suffix for free:
  ```ts
  title: {
    template: `%s | ${en.toolName}`,
    default: `${en.toolName} | ${en.tagline}`,
  }
  ```
  This alone improves the ~26 pages that already set a plain string title
  (`admin/*`, `platform/*`, template pages, privacy/terms) with zero extra
  edits to those files.
- Add `metadataBase` (using `getURL()` from `src/lib/get-url.ts`, falling back
  the same way it already does) so relative OG image paths resolve to
  absolute URLs.
- The tagline "Voice-based AI Assistant for Learning" is currently a hardcoded
  string duplicated in the title and description. Move it into
  `src/locales/en.json` as `"tagline": "Voice-based AI Assistant for Learning"`
  (next to the existing `"toolName": "ConvoEd"`), and reference `en.tagline`
  from `layout.tsx` everywhere it's used (title default, top-level
  `description`, and the `openGraph.description` below), so it can be changed
  in one place.
- Add default `openGraph` (`type: "website"`, `siteName: en.toolName`,
  `description: en.tagline`, `images: ["/home/hero.png"]`) and `twitter`
  (`card: "summary_large_image"`) blocks as the site-wide fallback. Every page
  that doesn't set its own `openGraph`/description inherits this, so shared
  links always show at least a branded, non-empty preview.
  - Using `/home/hero.png` (existing marketing asset) as the default share
    image since it's already a raster (PNG) image — SVGs (the only other brand
    asset) aren't reliably rendered by social-preview crawlers.

## 2. Dynamic titles for existing server-component detail pages

Add a `generateMetadata` export next to the existing fetch in each of these
files. To avoid a duplicate DB round-trip (metadata and the page component are
invoked separately by Next.js), wrap the fetch in React's `cache()` — same
technique `src/lib/dal.ts` already uses for `verifySession` — so both call
sites share one request-scoped result.

Representative pattern (applied per-file, column selection reused from the
existing query where possible):

```ts
const getAssignment = cache(async (assignmentId: string) => {
  const { supabase } = await verifySession("/teacher/login");
  const { data } = await supabase
    .from("assignments")
    .select(ASSIGNMENT_ALL_COLUMNS)
    .eq("assignment_id", assignmentId)
    .in("status", ["active", "draft"])
    .single();
  return data;
});

export async function generateMetadata({ params }: { params: Promise<{ assignmentId: string }> }) {
  const { assignmentId } = await params;
  const assignment = await getAssignment(assignmentId);
  return { title: assignment?.title ?? "Assignment" };
}

export default async function AssignmentDetailPage({ params }: Props) {
  const { assignmentId } = await params;
  const assignmentData = await getAssignment(assignmentId);
  if (!assignmentData) notFound();
  return <AssignmentDetailClient initialAssignment={assignmentData} classId={classId} />;
}
```

Files to update this way (entity's `title`/`name` column already selected in
each):
- `src/app/teacher/classes/[classId]/assignments/[assignmentId]/page.tsx` and the student equivalent
- `src/app/teacher/classes/[classId]/quizzes/[quizId]/page.tsx` and student equivalent
- `src/app/teacher/classes/[classId]/surveys/[surveyId]/page.tsx` and student equivalent
- `src/app/teacher/classes/[classId]/learning-content/[learningContentId]/page.tsx` and student equivalent
- `src/app/teacher/classes/[classId]/page.tsx` (class dashboard, `classData.name`) and student equivalent
- `src/app/teacher/activity-templates/[id]/page.tsx` and `.../edit/page.tsx` (swap the current static `"Template"`/`"Edit Template"` for the fetched template's `name`, reusing the already-imported `getTemplateById`)

Lower-priority, same pattern, optional in this pass since these already have
a passable static label: `admin/institutions/[id]/page.tsx`,
`admin/institutions/[id]/classes/[classDbId]/page.tsx`, and their
`platform/institutions/...` counterparts (swap static "Institution admin" /
"Class settings" for the fetched institution/class name).

## 3. Dynamic titles for client-only pages, via sibling `layout.tsx`

For each of these, add a new `layout.tsx` in the same folder as the existing
`'use client'` `page.tsx`. The layout is a plain server component that just
renders `{children}` and exports `generateMetadata`; it does **not** call
`verifySession` (which would add a new server-side redirect/auth gate to a
route that currently authenticates purely client-side) — instead it does a
resilient, unauthenticated-safe read via `createServerSupabaseClient()`
(`src/lib/supabase-server.ts`) and falls back to a generic label if the row
isn't readable (RLS-blocked, not found, etc.), so this change can only ever
affect the `<title>`, never behavior.

- `src/app/assignment/[assignmentId]/layout.tsx` — the public share link. Select
  `title, is_public` (`.eq("status","active")`); only use the real title/an
  `openGraph`/`twitter` block built from it when `is_public` is true (mirrors
  the existing security posture in `getAssignmentById`, which never reveals
  non-public assignment data to anonymous users) — otherwise fall back to the
  generic site default so nothing is leaked.

## 4. Static titles for the remaining untitled pages

Everything else with no meaningful title today gets a plain
`export const metadata = { title: "..." }` — directly in the file if it's
already a server component, or via a new sibling `layout.tsx` if it's
`'use client'` (same technique as above, just static instead of fetched).

Client pages needing a sibling static-metadata `layout.tsx`:
- `src/app/teacher/classes/[classId]/assignments/[assignmentId]/edit/layout.tsx` → "Edit Assignment"
- `src/app/teacher/classes/[classId]/quizzes/[quizId]/edit/layout.tsx` → "Edit Quiz"
- `src/app/teacher/classes/[classId]/surveys/[surveyId]/edit/layout.tsx` → "Edit Survey"
- `src/app/teacher/classes/[classId]/learning-content/[learningContentId]/edit/layout.tsx` → "Edit Learning Content"
- `src/app/try/page.tsx` → "Try It Out"
- `src/app/teacher/classes/page.tsx` → "My Classes", `src/app/teacher/classes/archived/page.tsx` → "Archived Classes"
- `src/app/student/classes/page.tsx` → "My Classes"
- `src/app/teacher/login/page.tsx`, `src/app/student/login/page.tsx` → "Teacher Login" / "Student Login"
- `src/app/teacher/invites/[token]/page.tsx`, `src/app/student/invites/[token]/page.tsx`, `src/app/admin/invites/[token]/page.tsx` → "Class Invite"
- `src/app/teacher/classes/[classId]/assignments/create/page.tsx`, `.../quizzes/create/page.tsx`, `.../surveys/create/page.tsx`, `.../learning-content/create/page.tsx` → "Create Assignment" / "Create Quiz" / "Create Survey" / "Create Learning Content"

Server pages/layouts that just need the export added directly:
- `src/app/page.tsx` → toolName default already covers this; add an explicit description instead if desired (optional)
- `src/app/login/page.tsx` → "Login"
- `src/app/teacher/page.tsx` → "Teacher"
- `src/app/teacher/classes/[classId]/settings/page.tsx`, `src/app/student/classes/[classId]/settings/page.tsx` → "Class Settings"

Skip (pure redirects, no UI, no title ever shown):
`.../assignments/[assignmentId]/submissions/page.tsx`,
`.../quizzes/[quizId]/submissions/page.tsx`,
`.../surveys/[surveyId]/responses/page.tsx`,
`.../learning-content/[learningContentId]/completions/page.tsx`.

## Verification

- `npm run build` (or `next build`) to confirm no "metadata export in a
  'use client' file" errors and that `generateMetadata` typings resolve.
- Run the dev server and manually check browser tabs for: a teacher
  assignment detail page, a student assignment detail page, an assignment
  edit page, a quiz/survey/learning-content detail page, the public
  `/assignment/[assignmentId]` share link, and a couple of the static pages
  (login, classes list) — confirm each shows a distinct, meaningful title
  ending in "| ConvoEd".
- For the public assignment link, use a social-preview debugger (or just
  inspect the rendered `<head>` via view-source / browser devtools) to confirm
  `og:title`, `og:description`, and `og:image` are populated for a public
  assignment and generic/non-leaking for a non-public one.
