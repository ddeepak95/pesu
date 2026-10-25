# Local Development Setup (concept-asr)

This doc explains how to get the full app running locally with a **local Supabase instance** (Supabase CLI + Docker).

## Prerequisites

- Node.js + npm (install a recent LTS)
- Docker Desktop running
- Supabase CLI installed

## 1) Install the app dependencies

From the repo root (`concept-asr`):

```bash
npm install
```

## 2) Start Supabase locally

Supabase CLI expects its project folder under `./supabase/` (including `supabase/migrations/`).

Start the local Supabase stack:

```bash
supabase start
```

Recreate the local database from the repo migrations:

```bash
supabase db reset
```

This makes the database match what’s committed in `supabase/migrations/` and runs the local seed file at `supabase/seed.sql`.

If the Supabase CLI is not on your PATH, use:

```bash
npx supabase db reset
```

### Local seed data

After `supabase db reset`, the database includes deterministic local fixtures for development:

| Entity | Details |
| --- | --- |
| Default institution | `Default Institution` (`slug`: `default`, `is_default`: `true`) |
| Platform super admin | `admin@example.com` / `password123` |
| Teacher (class owner) | `teacher@example.com` / `password123` |
| Student | `student@example.com` / `password123` |
| Class | `Seed Class` (`class_id`: `seedc001`, created by the teacher) |
| Enrollment | Seeded student is enrolled in `seedc001` |

Sign in at:

- Teacher: `/teacher/login`
- Student: `/student/login`

Use **Continue with Google** or expand **Or continue with email** for email/password sign-in with the seeded accounts above.

The super admin can access the platform surface at `/platform`. The seeded teacher should see `Seed Class` under `/teacher/classes`. The seeded student should see the same class under `/student/classes`.

To verify the seed loaded:

```sql
select public.default_institution_id();
select * from public.platform_super_admins;
select class_id, name, created_by from public.classes where class_id = 'seedc001';
select ct.* from public.class_teachers ct
join public.classes c on c.id = ct.class_id
where c.class_id = 'seedc001';
select cs.* from public.class_students cs
join public.classes c on c.id = cs.class_id
where c.class_id = 'seedc001';
```

### AI catalog (rubric generation, chat, evaluation)

Class-scoped AI features resolve **platform → institution → class** catalog settings. The SQL seed does not store encrypted API keys (those require `AI_CREDENTIALS_ENCRYPTION_KEY` from your app).

After `supabase db reset`, with `GEMINI_API_KEY` (or `GOOGLE_GENERATIVE_AI_API_KEY`) and `AI_CREDENTIALS_ENCRYPTION_KEY` in `.env.local`:

```bash
npm run seed:platform-ai
```

This activates the Google provider at platform scope and binds `text` + `text.rubric_generation` to `gemini-3-flash-preview`. Without this step, assignment rubric AI returns “AI is not configured for this class”.

## 3) Create / update `.env.local`

Copy the template:

```bash
cp env.example .env.local
```

Then enable the app’s local Supabase mode:

```env
NEXT_PUBLIC_USE_LOCAL_SUPABASE=true
```

Export the local Supabase connection values from the Supabase CLI:

```bash
supabase status -o env
```

Copy these into `.env.local`:

- `API URL` -> `NEXT_PUBLIC_SUPABASE_LOCAL_URL`
- `anon key` -> `NEXT_PUBLIC_SUPABASE_LOCAL_ANON_KEY`
- `service_role key` -> `SUPABASE_LOCAL_SERVICE_ROLE_KEY`

## 4) Run the Next.js app

In another terminal:

```bash
npm run dev
```

## Notes

- If you want to temporarily use the cloud Supabase project, set:
  - `NEXT_PUBLIC_USE_LOCAL_SUPABASE=false`
- Extra Supabase-specific bootstrap details (including how to generate migrations) are in:
  - `LOCAL_SUPABASE.md`

## Class PDF document processing

The class document library uses Google Document AI Layout Parser batch processing.
Enable the Document AI API, create a Layout Parser processor in the chosen region,
and set `DOCUMENT_AI_PROCESSOR_ID` and `DOCUMENT_AI_LOCATION` in the app environment.
The default processor version is `pretrained-layout-parser-v1.5-2025-08-25`;
set `DOCUMENT_AI_PROCESSOR_VERSION` to override it. The app uses the service account
in `FIREBASE_SERVICE_ACCOUNT_BASE64` to call Document AI. Grant that account
`roles/documentai.apiUser`. The Document AI service agent also needs access to
read PDFs and write JSON results in `FIREBASE_STORAGE_BUCKET`. If the processor
and bucket are in different projects, grant that service agent bucket access
explicitly. Apply the migration in `supabase/migrations/` before enabling upload.

For batch requests, set a `chunkSize` when using `includeAncestorHeadings`.
Do not set `returnImages` in batch mode: Document AI rejects it. With image
annotation enabled, the batch output still includes figure `blobAssets` and
descriptions for Markdown assembly.

Conversion is finalized when a teacher opens a processing document in the class
library; the library polls until the batch operation completes. Check a
representative searchable PDF, a scanned PDF, a table, and a figure before
enabling this preview processor for regular use.

The PDF, approved and draft Markdown, retrieval index, and separate figure images
are private GCS objects. Each version's `index.json` holds page-linked chunk
offsets and figure metadata; Supabase stores document title, tags, status, GCS
version pointers, and activity attachments. The class library searches title
and tags. `source_labels` such as `Figure 50.3A` live in the GCS index. A panel
label also includes the parent `Figure 50.3`, so all selected images in the
figure can be shown together. Teachers verify and correct labels in the editor.

Before applying the content-removal migration to a database with existing PDFs,
apply the additive GCS-version migration, then run
`npx tsx scripts/migrate-class-documents-to-gcs.ts --local` (or `--production`
for the linked project). The script verifies Markdown and every figure object
before it sets a GCS pointer. Migration `20261025040000` refuses to drop the
old content columns and tables if any legacy content remains unmigrated.

The platform `Document-guided learning` template is hidden from classes by
default. A class enables it in its template library; teachers attach ready
documents when creating activities. Student turns retrieve a small set of
passages from approved GCS versions. The `display_content` action uses stable
figure references and an attempt-authorized image route, including public
activity attempts.

