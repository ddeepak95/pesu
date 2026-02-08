import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseUrl, getSupabaseAnonKey } from "@/lib/supabase-config";

/**
 * Proxy for auth-based route protection and Supabase token refresh.
 *
 * Supabase SSR requires the proxy to create a server client and call
 * getUser() so that expired JWT tokens are refreshed and written back
 * to cookies. Without this, tokens silently expire and server-side
 * auth checks fail.
 *
 * Real authorization logic lives in the Data Access Layer (src/lib/dal.ts).
 * The proxy only handles route-level redirects.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return request.cookies
          .getAll()
          .map(({ name, value }) => ({ name, value }));
      },
      setAll(
        cookiesToSet: { name: string; value: string; options: CookieOptions }[]
      ) {
        // In Proxy, cookies must be set on the response.
        response = NextResponse.next({
          request: {
            headers: request.headers,
          },
        });

        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set({ name, value, ...options });
        }
      },
    },
  });

  // This call refreshes the auth token if expired and writes the
  // new token back to cookies via the setAll callback above.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const fullPath = pathname + request.nextUrl.search;

  // ===== TEACHER ROUTES =====
  if (
    !user &&
    pathname.startsWith("/teacher") &&
    !pathname.startsWith("/teacher/login")
  ) {
    const loginUrl = new URL("/teacher/login", request.url);
    loginUrl.searchParams.set("redirect", fullPath);
    return NextResponse.redirect(loginUrl);
  }

  if (user && pathname === "/teacher/login") {
    const redirectTo = request.nextUrl.searchParams.get("redirect");
    if (redirectTo) {
      return NextResponse.redirect(new URL(redirectTo, request.url));
    }
    return NextResponse.redirect(new URL("/teacher/classes", request.url));
  }

  // ===== STUDENT ROUTES =====
  if (
    !user &&
    pathname.startsWith("/student") &&
    !pathname.startsWith("/student/login")
  ) {
    const loginUrl = new URL("/student/login", request.url);
    loginUrl.searchParams.set("redirect", fullPath);
    return NextResponse.redirect(loginUrl);
  }

  if (user && pathname === "/student/login") {
    const redirectTo = request.nextUrl.searchParams.get("redirect");
    if (redirectTo) {
      return NextResponse.redirect(new URL(redirectTo, request.url));
    }
    return NextResponse.redirect(new URL("/student/classes", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/teacher/:path*", "/student/:path*"],
};
