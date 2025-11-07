# Authentication Setup Documentation

## Overview

This project now has Supabase authentication integrated with protected routes for teacher pages.

## What Was Implemented

### 1. Supabase Client Setup

- **Client-side client** (`src/lib/supabase.ts`): `createClient()` for use in client components
- **Server-side client** (`src/lib/supabase-server.ts`): `createServerSupabaseClient()` for use in server components
- Both clients are configured to work with Next.js App Router and cookies

### 2. Authentication Context (`src/contexts/AuthContext.tsx`)

- Provides authentication state throughout the app
- Exports `useAuth()` hook for accessing:
  - `user`: Current user object or null
  - `loading`: Authentication loading state
  - `signIn(email, password)`: Function to sign in
  - `signOut()`: Function to sign out

### 3. Login Page (`src/app/teacher/login/page.tsx`)

- Beautiful login form using shadcn UI components
- Located at `/teacher/login`
- Email and password authentication
- Error handling and loading states
- Maintains global CSS styling

### 4. Route Protection (`src/middleware.ts`)

- Middleware protects all `/teacher/*` routes
- Automatically redirects unauthenticated users to `/teacher/login`
- Redirects authenticated users away from login page to dashboard
- Uses Supabase session management

### 5. Updated Components

- **Header**: Now shows user email and dropdown menu with sign out option
- **PageLayout**: Simplified to work with auth context
- All teacher pages wrapped with authentication

## Setup Instructions

### 1. Configure Environment Variables

Create a `.env.local` file in the root directory with your Supabase credentials:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

You can find these values in your Supabase project dashboard under Settings > API.

### 2. Enable Email Authentication in Supabase

1. Go to your Supabase project dashboard
2. Navigate to Authentication > Providers
3. Enable Email provider
4. Configure email templates (optional)

### 3. Create a Test User

You can create test users in two ways:

**Option A: Using Supabase Dashboard**

1. Go to Authentication > Users
2. Click "Add user"
3. Enter email and password

**Option B: Using Supabase Auth API**

```javascript
const { data, error } = await supabase.auth.signUp({
  email: "teacher@example.com",
  password: "your-secure-password",
});
```

## Usage

### Accessing Protected Routes

All routes under `/teacher/*` are now protected:

- `/teacher` - Teacher dashboard
- `/teacher/classes` - Classes list
- `/teacher/classes/[classId]` - Individual class details

### Using Authentication in Components

```tsx
"use client";

import { useAuth } from "@/contexts/AuthContext";

export default function MyComponent() {
  const { user, signOut } = useAuth();

  return (
    <div>
      <p>Logged in as: {user?.email}</p>
      <button onClick={signOut}>Sign Out</button>
    </div>
  );
}
```

### Sign In Flow

1. User navigates to `/teacher` (or any protected route)
2. Middleware redirects to `/teacher/login`
3. User enters credentials
4. On success, redirected to `/teacher`
5. Session is maintained via cookies

### Sign Out Flow

1. User clicks dropdown menu in header
2. Clicks "Sign Out"
3. User is signed out via Supabase
4. Redirected to `/teacher/login`

## Styling

- All components use shadcn UI for consistency
- Colors are defined in `src/app/globals.css` using CSS variables
- Dark mode support included
- Maintains existing design system

## Security Features

- Server-side session validation
- Automatic token refresh
- Secure cookie management
- Protected API routes ready
- CSRF protection via Supabase

## Next Steps (Optional Enhancements)

1. **Email Verification**: Enable email confirmation in Supabase
2. **Password Reset**: Add forgot password functionality
3. **User Profiles**: Create a profile table linked to auth.users
4. **Role-Based Access**: Add custom claims for teacher/student roles
5. **OAuth Providers**: Enable Google/GitHub sign-in
6. **Remember Me**: Add persistent sessions
7. **Two-Factor Authentication**: Enable 2FA in Supabase

## Troubleshooting

### "Invalid credentials" error

- Verify email/password are correct
- Check if email is confirmed (if required)
- Ensure Supabase URL and keys are correct

### Redirects not working

- Clear browser cookies
- Check middleware configuration
- Verify environment variables are loaded

### User not persisting after refresh

- Check if cookies are being set correctly
- Verify Supabase session management
- Check browser cookie settings

## Dependencies Added

- `@supabase/ssr` - Supabase Server-Side Rendering support
- shadcn components: `button`, `input`, `card`, `label`
