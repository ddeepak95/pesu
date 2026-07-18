import "server-only";

import { redirect } from "next/navigation";

import { verifySession } from "@/lib/dal";
import { getEffectiveSettingsForClass } from "@/lib/queries/settings";
import { getEffectiveValue } from "@/lib/settings/resolve";
import type { ContentTypeId } from "@/lib/settings/registry";

/**
 * Defense-in-depth for content creation: resolve the effective
 * `allowed_content_types` for a class server-side and redirect back to the
 * class content tab when the requested type is disallowed. Hiding a Create menu
 * item is not authorization — this runs in the create route's layout so a
 * direct URL cannot bypass the institution/class policy.
 *
 * Intentionally lenient on lookup failures: if the class can't be resolved we
 * return and let the page render its own not-found state rather than masking it
 * with a redirect.
 */
export async function guardContentTypeCreation(
  classShortId: string,
  type: ContentTypeId,
): Promise<void> {
  const { supabase } = await verifySession("/teacher/login");

  const { data: classRow } = await supabase
    .from("classes")
    .select("id")
    .eq("class_id", classShortId)
    .maybeSingle();
  if (!classRow?.id) return;

  const effective = await getEffectiveSettingsForClass(
    supabase,
    classRow.id as string,
  );
  const allowed = getEffectiveValue(effective, "allowed_content_types");
  if (!allowed.includes(type)) {
    redirect(`/teacher/classes/${classShortId}?tab=content`);
  }
}
