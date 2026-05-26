import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { getSupabaseUrl, getSupabaseAnonKey } from './supabase-config'

// Server-side Supabase client for API routes
export async function createServerSupabaseClient() {
  const cookieStore = await cookies()

  return createServerClient(
    getSupabaseUrl(),
    getSupabaseAnonKey(),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  )
}

// Service role client for trusted server-side operations that bypass RLS
export function createServiceRoleClient() {
  const useLocal = process.env.NEXT_PUBLIC_USE_LOCAL_SUPABASE === "true"
  const serviceRoleKey = useLocal
    ? process.env.SUPABASE_LOCAL_SERVICE_ROLE_KEY
    : process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!serviceRoleKey) {
    throw new Error(
      useLocal
        ? "SUPABASE_LOCAL_SERVICE_ROLE_KEY environment variable is not set (required when NEXT_PUBLIC_USE_LOCAL_SUPABASE=true)"
        : "SUPABASE_SERVICE_ROLE_KEY environment variable is not set"
    )
  }

  return createClient(
    getSupabaseUrl(),
    serviceRoleKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
