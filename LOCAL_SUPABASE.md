# Local Supabase (Supabase CLI) - concept-asr

This project can use either the cloud Supabase instance or a local Docker-backed
Supabase instance for development.

## Switch the app to local

In your `.env.local`, set:

```env
NEXT_PUBLIC_USE_LOCAL_SUPABASE=true
```

Then set these values from `supabase status -o env` (see below):

```env
NEXT_PUBLIC_SUPABASE_LOCAL_URL=...
NEXT_PUBLIC_SUPABASE_LOCAL_ANON_KEY=...
SUPABASE_LOCAL_SERVICE_ROLE_KEY=...
```

## One-time setup: get local schema from the cloud

This is the most reliable way to replicate the production cloud schema:
use `supabase db pull` from the linked cloud project, then apply it to the
local database.

### 1) Prerequisites

- Docker Desktop running
- Supabase CLI installed (`supabase --version`)

### 2) Initialize the local Supabase project (if needed)

From this repo directory (`concept-asr`):

```bash
supabase init
```

This creates `supabase/config.toml` and sets up the local working folders.

### 3) Link local to your cloud project

You need your cloud Supabase project's ref (project id). Find it in the URL of
your dashboard:

`https://supabase.com/dashboard/project/<PROJECT_REF>`

Then run:

```bash
supabase link --project-ref <PROJECT_REF>
```

Note: your repo already contains a hint at `supabase/.temp/project-ref`.
You can read it with:

```powershell
Get-Content .\supabase\.temp\project-ref
```

### 4) Pull schema from cloud into local migrations

`supabase db pull` writes migration files under `supabase/migrations/` (the
schema source of truth for local dev + CI).

This is separate from the legacy repo folder `supabase-migrations/` and you
should not rely on it for the Supabase CLI migration workflow.

Pull `public` first:

```bash
supabase db pull --linked --schema public
```

Then pull auth + storage schemas:

```bash
supabase db pull --linked --schema auth,storage
```

### 5) Reset the local database and apply the pulled migrations

```bash
supabase db reset
```

### 6) Start the local Supabase stack

```bash
supabase start
```

## Copy the local connection values into `.env.local`

Run:

```bash
supabase status -o env
```

Copy the values into `.env.local`:

- `API URL` -> `NEXT_PUBLIC_SUPABASE_LOCAL_URL`
- `anon key` -> `NEXT_PUBLIC_SUPABASE_LOCAL_ANON_KEY`
- `service_role key` -> `SUPABASE_LOCAL_SERVICE_ROLE_KEY`

## Verify locally

1. Start your app: `npm run dev`
2. Open Supabase Studio:
   - either from the CLI output, or run `supabase studio`
3. Create/sign in a test user (email/password) if needed.

