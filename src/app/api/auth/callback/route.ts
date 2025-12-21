import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const next = requestUrl.searchParams.get('next') || '/teacher'
  const error = requestUrl.searchParams.get('error')
  const errorDescription = requestUrl.searchParams.get('error_description')

  // If there's an error from OAuth provider, redirect to login with error
  if (error) {
    const errorMessage = errorDescription 
      ? `Authentication failed: ${decodeURIComponent(errorDescription)}`
      : 'Authentication failed'
    return NextResponse.redirect(
      new URL(`/teacher/login?error=${encodeURIComponent(errorMessage)}`, request.url)
    )
  }

  if (code) {
    try {
      const supabase = await createServerSupabaseClient()
      
      // Exchange the code for a session
      const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
      
      if (!exchangeError && data.session) {
        // Successful authentication, redirect to the intended destination
        return NextResponse.redirect(new URL(next, request.url))
      } else {
        console.error('Error exchanging code for session:', exchangeError)
        return NextResponse.redirect(
          new URL(
            `/teacher/login?error=${encodeURIComponent(exchangeError?.message || 'Could not authenticate')}`,
            request.url
          )
        )
      }
    } catch (err) {
      console.error('Unexpected error in OAuth callback:', err)
      return NextResponse.redirect(
        new URL('/teacher/login?error=An unexpected error occurred', request.url)
      )
    }
  }

  // If there's no code, redirect to login
  return NextResponse.redirect(new URL('/teacher/login?error=No authorization code provided', request.url))
}

