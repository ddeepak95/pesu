import { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase";

/**
 * Simple in-memory cache for the authenticated user.
 * Avoids redundant supabase.auth.getUser() calls when multiple query functions
 * run on the same page load. The cache expires after a short TTL.
 */
let cachedUser: User | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5000; // 5 seconds

export async function getCachedUser(): Promise<User | null> {
  const now = Date.now();
  if (cachedUser && now - cacheTimestamp < CACHE_TTL) {
    return cachedUser;
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  cachedUser = user;
  cacheTimestamp = now;
  return cachedUser;
}

/**
 * Invalidate the cached user (call after sign-out or auth state change)
 */
export function clearUserCache(): void {
  cachedUser = null;
  cacheTimestamp = 0;
}
