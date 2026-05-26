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

