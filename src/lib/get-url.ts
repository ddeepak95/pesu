/**
 * Get the base URL for the application
 * Follows Supabase's recommended pattern for handling redirect URLs
 * @see https://supabase.com/docs/guides/auth/redirect-urls
 * 
 * In the browser, uses window.location.origin (which is always correct)
 * On the server, uses environment variables
 */
export function getURL(): string {
  // In the browser, always use window.location.origin (most reliable)
  if (typeof window !== 'undefined') {
    return window.location.origin
  }
  
  // Server-side: use environment variables
  let url =
    process?.env?.NEXT_PUBLIC_SITE_URL ?? // Set this to your site URL in production env.
    process?.env?.NEXT_PUBLIC_VERCEL_URL ?? // Automatically set by Vercel.
    'http://localhost:3000'
  
  // Make sure to include `https://` when not localhost.
  url = url.startsWith('http') ? url : `https://${url}`
  
  return url
}

/**
 * Get the base URL without trailing slash (for constructing paths)
 * In the browser, uses window.location.origin (always correct)
 * On the server, uses environment variables
 */
export function getBaseURL(): string {
  // In the browser, always use window.location.origin (most reliable)
  if (typeof window !== 'undefined') {
    return window.location.origin
  }
  
  // Server-side: use environment variables
  let url =
    process?.env?.NEXT_PUBLIC_SITE_URL ?? // Set this to your site URL in production env.
    process?.env?.NEXT_PUBLIC_VERCEL_URL ?? // Automatically set by Vercel.
    'http://localhost:3000'
  
  // Make sure to include `https://` when not localhost.
  url = url.startsWith('http') ? url : `https://${url}`
  
  return url
}

