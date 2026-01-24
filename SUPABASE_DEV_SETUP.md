# Supabase Development Instance Setup Guide

This guide walks you through setting up a separate Supabase development instance and configuring it with all necessary database migrations.

## Overview

This project uses separate Supabase instances for development and production. The environment is selected via the `NEXT_PUBLIC_SUPABASE_ENV` environment variable (or `SUPABASE_ENV` for the backend).

## Step 1: Extract Complete Schema from Production Instance

Before setting up the dev instance, extract the complete schema from your current production Supabase instance.

### Option A: Using Supabase CLI (Recommended)

1. **Install Supabase CLI**:
   ```bash
   npm install -g supabase
   # or
   brew install supabase/tap/supabase
   ```

2. **Link to your existing production project**:
   ```bash
   supabase link --project-ref <your-project-ref>
   ```
   - You can find your project ref in the Supabase dashboard URL (e.g., `https://supabase.com/dashboard/project/eczcwtvcanbrgtdpnkxr`) or in Settings > General
   - You'll be prompted to enter your database password

3. **Generate complete schema dump**:
   ```bash
   supabase db dump --schema-only -f supabase-migrations/00_complete_schema.sql
   ```
   - The `--schema-only` flag ensures you get only schema definitions (no data)
   - This creates `supabase-migrations/00_complete_schema.sql` which will be used to set up the dev instance

4. **Review the generated file** to ensure it's complete (tables, functions, policies, indexes, etc.)

### Alternative Methods

If you prefer not to use Supabase CLI, see the plan document for alternative methods (pg_dump, SQL queries, or custom scripts).

## Step 2: Create New Supabase Project for Development

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Click "New Project"
3. Fill in the project details:
   - **Name**: e.g., "concept-asr-dev"
   - **Database Password**: Choose a strong password (save it securely)
   - **Region**: Choose a region close to you
4. Wait for the project to be created (this may take a few minutes)

## Step 3: Get Development Project Credentials

1. In your new dev project dashboard, go to **Settings > API**
2. Copy the following values:
   - **Project URL**: Found under "Project URL"
   - **anon/public key**: Found under "Project API keys" > "anon public"

## Step 4: Configure Environment Variables

### Frontend Configuration

Update your `.env.local` file (or create it if it doesn't exist) in the project root:

```env
# Supabase Environment Selection
NEXT_PUBLIC_SUPABASE_ENV=development

# Development Supabase Instance
NEXT_PUBLIC_SUPABASE_DEV_URL=https://your-dev-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_DEV_ANON_KEY=your_dev_anon_key_here

# Production Supabase Instance
NEXT_PUBLIC_SUPABASE_PROD_URL=https://your-prod-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_PROD_ANON_KEY=your_prod_anon_key_here
```

### Backend Configuration

Update `pesu-server/.env`:

```env
# Supabase Environment Selection
SUPABASE_ENV=development

# Development Supabase Instance
SUPABASE_DEV_URL=https://your-dev-project-ref.supabase.co
SUPABASE_DEV_ANON_KEY=your_dev_anon_key_here

# Production Supabase Instance
SUPABASE_PROD_URL=https://your-prod-project-ref.supabase.co
SUPABASE_PROD_ANON_KEY=your_prod_anon_key_here
```

## Step 5: Run Migrations on Development Instance

1. **Open Supabase SQL Editor**:
   - Go to your dev project dashboard
   - Navigate to **SQL Editor** in the left sidebar

2. **Run the complete schema migration**:
   - Open the file `supabase-migrations/00_complete_schema.sql`
   - Copy its entire contents
   - Paste into the SQL Editor
   - Click "Run" or press `Ctrl+Enter` (Windows/Linux) or `Cmd+Enter` (Mac)
   - Wait for the migration to complete (this may take a few minutes)

3. **Verify the migration**:
   - Check the "Table Editor" in the dashboard to see if tables were created
   - Verify RLS policies are enabled (check in "Authentication > Policies")

## Step 6: Verify Schema Setup

### Check Tables

1. Go to **Table Editor** in your dev project dashboard
2. Verify the following tables exist (this list may vary based on your schema):
   - `classes`
   - `class_groups`
   - `class_teachers`
   - `class_students`
   - `assignments`
   - `submissions`
   - `voice_messages`
   - `quizzes`
   - `learning_contents`
   - `content_items`
   - `class_teacher_invites`
   - `class_student_invites`
   - And any other tables from your schema

### Check RLS Policies

1. Go to **Authentication > Policies** in your dev project dashboard
2. Verify that Row Level Security (RLS) is enabled on all tables
3. Check that policies are created for:
   - Teacher access to their classes
   - Student access to their assigned classes
   - Appropriate read/write permissions

### Check Functions

1. Go to **Database > Functions** in your dev project dashboard
2. Verify that custom functions exist (e.g., `get_class_teachers_with_user_info`, `create_teacher_invite`, etc.)

## Step 7: Test the Connection

1. **Start your development server**:
   ```bash
   npm run dev
   ```

2. **Verify environment selection**:
   - The app should connect to your dev instance when `NEXT_PUBLIC_SUPABASE_ENV=development`
   - Check browser console and server logs for any connection errors

3. **Test authentication**:
   - Try logging in as a teacher or student
   - Verify that data operations work correctly

## Step 8: Switch Between Environments

To switch between development and production:

### For Development:
```env
NEXT_PUBLIC_SUPABASE_ENV=development
SUPABASE_ENV=development
```

### For Production:
```env
NEXT_PUBLIC_SUPABASE_ENV=production
SUPABASE_ENV=production
```

**Important**: Always restart your development server after changing environment variables.

## Troubleshooting

### Migration Errors

- **"relation already exists"**: The table/object already exists. You may need to drop it first or modify the migration to use `CREATE TABLE IF NOT EXISTS`
- **"permission denied"**: Ensure you're using the correct database password and have proper permissions
- **"syntax error"**: Check the SQL file for any syntax issues. The extracted schema should be valid SQL

### Connection Issues

- **"Invalid API key"**: Verify that you copied the correct anon key from the Supabase dashboard
- **"Project not found"**: Check that the project URL is correct and the project exists
- **Environment variable not loading**: Ensure `.env.local` is in the project root and restart the dev server

### RLS Policy Issues

- **"new row violates row-level security policy"**: RLS policies may not be set up correctly. Review the policies in the Supabase dashboard
- **"permission denied for table"**: Check that RLS policies allow the current user to access the table

### Schema Mismatches

If your dev instance doesn't match production:

1. Compare table structures in both instances
2. Check for missing indexes, functions, or policies
3. Re-run the `00_complete_schema.sql` migration if needed (you may need to drop existing objects first)

## Additional Notes

- The `classes` table is referenced by many migrations. Ensure it exists in your extracted schema
- Some migrations may reference functions or types that need to be created first
- Always test migrations on the dev instance before applying to production
- Keep your dev instance schema in sync with production by re-extracting the schema when production changes

## Next Steps

After setting up the dev instance:

1. Create test users in the dev instance for development
2. Test all application features with the dev database
3. Use the dev instance for testing new migrations before applying to production
4. Keep production credentials secure and never commit them to version control
