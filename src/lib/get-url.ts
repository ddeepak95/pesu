/**
 * Get the base URL for the application
 * Follows Supabase's recommended pattern for handling redirect URLs
 * @see https://supabase.com/docs/guides/auth/redirect-urls
 */
export function getURL(): string {
  let url =
    process?.env?.NEXT_PUBLIC_SITE_URL ?? // Set this to your site URL in production env.
    process?.env?.NEXT_PUBLIC_VERCEL_URL ?? // Automatically set by Vercel.
    'http://localhost:3000/'
  
  // Make sure to include `https://` when not localhost.
  url = url.startsWith('http') ? url : `https://${url}`
  
  // Make sure to include a trailing `/`.
  url = url.endsWith('/') ? url : `${url}/`
  
  return url
}

/**
 * Get the base URL without trailing slash (for constructing paths)
 */
export function getBaseURL(): string {
  const url = getURL()
  return url.endsWith('/') ? url.slice(0, -1) : url
}

