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

This makes the database match what’s committed in `supabase/migrations/`.

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

