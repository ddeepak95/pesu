import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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

  // If user is not logged in and trying to access teacher pages (except login)
  if (!user && request.nextUrl.pathname.startsWith('/teacher') && !request.nextUrl.pathname.startsWith('/teacher/login')) {
    return NextResponse.redirect(new URL('/teacher/login', request.url))
  }

  // If user is logged in and trying to access login page, redirect to teacher dashboard
  if (user && request.nextUrl.pathname === '/teacher/login') {
    return NextResponse.redirect(new URL('/teacher', request.url))
  }

  return response
}

export const config = {
  matcher: ['/teacher/:path*'],
}

