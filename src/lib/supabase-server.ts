import { createServerClient } from '@supabase/ssr'
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
