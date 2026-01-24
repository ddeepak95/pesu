import { createBrowserClient } from '@supabase/ssr'
import { getSupabaseUrl, getSupabaseAnonKey } from './supabase-config'

// Client-side Supabase client
export function createClient() {
  return createBrowserClient(
    getSupabaseUrl(),
    getSupabaseAnonKey()
  )
}