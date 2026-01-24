import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { getSupabaseUrl, getSupabaseAnonKey } from '@/lib/supabase-config'

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    getSupabaseUrl(),
    getSupabaseAnonKey(),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll().map(({ name, value }) => ({ name, value }))
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          // In Middleware, cookies must be set on the response.
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })

          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set({ name, value, ...options })
          }
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname
  const fullPath = pathname + request.nextUrl.search

  // ===== TEACHER ROUTES =====
  // If user is not logged in and trying to access teacher pages (except login)
  if (!user && pathname.startsWith('/teacher') && !pathname.startsWith('/teacher/login')) {
    const loginUrl = new URL('/teacher/login', request.url)
    // Preserve the original URL so user can be redirected back after login
    loginUrl.searchParams.set('redirect', fullPath)
    return NextResponse.redirect(loginUrl)
  }

  // If user is logged in and trying to access teacher login page
  if (user && pathname === '/teacher/login') {
    // Check if there's a redirect parameter
    const redirectTo = request.nextUrl.searchParams.get('redirect')
    if (redirectTo) {
      return NextResponse.redirect(new URL(redirectTo, request.url))
    }
    // No redirect param, go to teacher dashboard
    return NextResponse.redirect(new URL('/teacher/classes', request.url))
  }

  // ===== STUDENT ROUTES =====
  // If user is not logged in and trying to access student pages (except login)
  if (!user && pathname.startsWith('/students') && !pathname.startsWith('/students/login')) {
    const loginUrl = new URL('/students/login', request.url)
    // Preserve the original URL so user can be redirected back after login
    loginUrl.searchParams.set('redirect', fullPath)
    return NextResponse.redirect(loginUrl)
  }

  // If user is logged in and trying to access student login page
  if (user && pathname === '/students/login') {
    // Check if there's a redirect parameter
    const redirectTo = request.nextUrl.searchParams.get('redirect')
    if (redirectTo) {
      return NextResponse.redirect(new URL(redirectTo, request.url))
    }
    // No redirect param, go to student classes
    return NextResponse.redirect(new URL('/students/classes', request.url))
  }

  return response
}

export const config = {
  matcher: ['/teacher/:path*', '/students/:path*'],
}

