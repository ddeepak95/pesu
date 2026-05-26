/**
 * Supabase configuration helper
 * 
 * Selects the appropriate Supabase instance (development or production)
 * based on the NEXT_PUBLIC_SUPABASE_ENV environment variable.
 *
 * If NEXT_PUBLIC_USE_LOCAL_SUPABASE=true, overrides both development and
 * production and uses the local Supabase URL/anon key instead.
 * 
 * Defaults to 'development' if not set.
 */

/**
 * Get the Supabase URL based on the current environment
 * @returns The Supabase project URL for the current environment
 * @throws Error if the required environment variable is not set
 */
function isUsingLocalSupabase(): boolean {
  return process.env.NEXT_PUBLIC_USE_LOCAL_SUPABASE === "true"
}

export function getSupabaseUrl(): string {
  if (isUsingLocalSupabase()) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_LOCAL_URL
    if (!url) {
      throw new Error(
        "NEXT_PUBLIC_SUPABASE_LOCAL_URL environment variable is not set (required when NEXT_PUBLIC_USE_LOCAL_SUPABASE=true)"
      )
    }
    return url
  }

  const env = process.env.NEXT_PUBLIC_SUPABASE_ENV || "development"
  
  if (env === "production") {
    const url = process.env.NEXT_PUBLIC_SUPABASE_PROD_URL
    if (!url) {
      throw new Error(
        "NEXT_PUBLIC_SUPABASE_PROD_URL environment variable is not set"
      )
    }
    return url
  } else {
    // Default to development
    const url = process.env.NEXT_PUBLIC_SUPABASE_DEV_URL
    if (!url) {
      throw new Error(
        "NEXT_PUBLIC_SUPABASE_DEV_URL environment variable is not set"
      )
    }
    return url
  }
}

/**
 * Get the Supabase anon key based on the current environment
 * @returns The Supabase anon key for the current environment
 * @throws Error if the required environment variable is not set
 */
export function getSupabaseAnonKey(): string {
  if (isUsingLocalSupabase()) {
    const key = process.env.NEXT_PUBLIC_SUPABASE_LOCAL_ANON_KEY
    if (!key) {
      throw new Error(
        "NEXT_PUBLIC_SUPABASE_LOCAL_ANON_KEY environment variable is not set (required when NEXT_PUBLIC_USE_LOCAL_SUPABASE=true)"
      )
    }
    return key
  }

  const env = process.env.NEXT_PUBLIC_SUPABASE_ENV || "development"
  
  if (env === "production") {
    const key = process.env.NEXT_PUBLIC_SUPABASE_PROD_ANON_KEY
    if (!key) {
      throw new Error(
        "NEXT_PUBLIC_SUPABASE_PROD_ANON_KEY environment variable is not set"
      )
    }
    return key
  } else {
    // Default to development
    const key = process.env.NEXT_PUBLIC_SUPABASE_DEV_ANON_KEY
    if (!key) {
      throw new Error(
        "NEXT_PUBLIC_SUPABASE_DEV_ANON_KEY environment variable is not set"
      )
    }
    return key
  }
}
