import "server-only";

import { cache } from "react";
import { redirect, notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { ContentItem } from "@/types/contentItem";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Verify the user's session. Memoized per request via React cache().
 *
 * Call this in Server Components, Server Actions, and Route Handlers.
 * Multiple calls within the same request only trigger one getUser() round-trip.
 *
 * Redirects to the provided loginPath if the user is not authenticated.
 */
export const verifySession = cache(
  async (loginPath = "/teacher/login") => {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect(loginPath);
    }

    return { user, supabase };
  }
);

/**
 * Verify the user's session and that they appear in `public.platform_super_admins`.
 *
 * Use in server components, server actions, and route handlers under `/platform`
 * or any other internal super-admin surface. Returns notFound() (instead of
 * redirect) for non-super-admins so the surface stays unannounced.
 */
export const requireSuperAdmin = cache(
  async (loginPath = "/teacher/login") => {
    const { user, supabase } = await verifySession(loginPath);

    const { data, error } = await supabase
      .from("platform_super_admins")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error || !data) {
      notFound();
    }

    return { user, supabase };
  }
);

/**
 * Verify the user is either a platform super admin OR an admin of the
 * supplied institution.
 *
 * Returns `notFound()` (consistent with `requireSuperAdmin`) when the viewer
 * has neither role. The returned `viewerRole` lets server components pass the
 * right capability tier into the shared UI components without re-querying.
 */
export const requireInstitutionAdminOrSuper = cache(
  async (institutionId: string, loginPath = "/teacher/login") => {
    const { user, supabase } = await verifySession(loginPath);

    const [superRes, memberRes] = await Promise.all([
      supabase
        .from("platform_super_admins")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("institution_members")
        .select("user_id, role")
        .eq("institution_id", institutionId)
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle(),
    ]);

    const isSuper = !superRes.error && !!superRes.data;
    const isInstitutionAdmin = !memberRes.error && !!memberRes.data;

    if (!isSuper && !isInstitutionAdmin) {
      notFound();
    }

    const viewerRole: "super_admin" | "institution_admin" = isSuper
      ? "super_admin"
      : "institution_admin";

    return { user, supabase, viewerRole };
  }
);

// ---------------------------------------------------------------------------
// Shared server-side helper: content item + progressive unlock state
// ---------------------------------------------------------------------------

export { getContentUnlockState, type ContentUnlockResult } from "@/lib/content/unlock";

/** Map content item type to student URL path segment. */
const CONTENT_TYPE_SEGMENT: Record<ContentItem["type"], string> = {
  chatbot: "chatbots",
  formative_assignment: "assignments",
  learning_content: "learning-content",
  quiz: "quizzes",
  survey: "surveys",
};

/**
 * Resolve the public id (assignment_id, learning_content_id, quiz_id, survey_id)
 * for a content item ref so the student URL can be built.
 */
export async function getPublicIdForContentRef(
  supabase: SupabaseClient,
  refId: string,
  type: ContentItem["type"]
): Promise<string | null> {
  if (type === "chatbot") {
    const { data } = await supabase.from("chatbots").select("chatbot_id").eq("id", refId).maybeSingle();
    return data?.chatbot_id ?? null;
  }
  if (type === "formative_assignment") {
    const { data } = await supabase
      .from("assignments")
      .select("assignment_id")
      .eq("id", refId)
      .maybeSingle();
    return data?.assignment_id ?? null;
  }
  if (type === "learning_content") {
    const { data } = await supabase
      .from("learning_contents")
      .select("learning_content_id")
      .eq("id", refId)
      .maybeSingle();
    return data?.learning_content_id ?? null;
  }
  if (type === "quiz") {
    const { data } = await supabase
      .from("quizzes")
      .select("quiz_id")
      .eq("id", refId)
      .maybeSingle();
    return data?.quiz_id ?? null;
  }
  if (type === "survey") {
    const { data } = await supabase
      .from("surveys")
      .select("survey_id")
      .eq("id", refId)
      .maybeSingle();
    return data?.survey_id ?? null;
  }
  return null;
}

/**
 * Build the full student URL for a content item (previous item link).
 * Returns null if the public id cannot be resolved.
 */
export async function buildContentItemUrl(
  supabase: SupabaseClient,
  classId: string,
  refId: string,
  type: ContentItem["type"]
): Promise<string | null> {
  const publicId = await getPublicIdForContentRef(supabase, refId, type);
  if (!publicId) return null;
  const segment = CONTENT_TYPE_SEGMENT[type];
  return `/student/classes/${classId}/${segment}/${publicId}`;
}
