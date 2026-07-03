/**
 * Activity-template reads — Phase 2 of dev-docs/activity-templates-plan.md.
 *
 * RLS-enforced reads for the personal + class libraries and the class palette.
 * Mutations live in `src/lib/templates/actions.ts` (gated server actions); this
 * module is the read side, usable from client components (default browser
 * client) or server components (inject the request-scoped server client).
 *
 * The class palette here is the Phase 2 **simple, uncurated** union: system
 * templates (all) + the class's own class-owned templates. Institution curation
 * and the "add a personal template to this class" link are Phase 3 / a later
 * Phase 2 slice (they need a membership table), so they are intentionally absent.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase";
import type { TemplateDefinition } from "@/lib/activityTypes/templates";

export type TemplateOwnerScope = "user" | "class" | "institution" | "system";
export type TemplateVisibility = "private" | "public";
export type TemplateStatus = "active" | "archived";

export interface ActivityTemplateRow {
  id: string;
  name: string;
  description: string | null;
  definition: TemplateDefinition;
  owner_scope: TemplateOwnerScope;
  owner_user_id: string | null;
  owner_class_id: string | null;
  institution_id: string | null;
  visibility: TemplateVisibility;
  status: TemplateStatus;
  forked_from: string | null;
  upstream_synced_at: string | null;
  origin_author_id: string | null;
  origin_author_name: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

const TEMPLATE_COLUMNS =
  "id, name, description, definition, owner_scope, owner_user_id, owner_class_id, institution_id, visibility, status, forked_from, upstream_synced_at, origin_author_id, origin_author_name, created_by, created_at, updated_at";

/** The teacher's personal ("My Templates") library — active user-owned rows. */
export async function listMyTemplates(
  userId: string,
  client?: SupabaseClient,
): Promise<ActivityTemplateRow[]> {
  const supabase = client ?? createClient();
  const { data, error } = await supabase
    .from("activity_templates")
    .select(TEMPLATE_COLUMNS)
    .eq("owner_scope", "user")
    .eq("owner_user_id", userId)
    .eq("status", "active")
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as ActivityTemplateRow[];
}

/** All active system templates (the built-in activity types). */
export async function listSystemTemplates(
  client?: SupabaseClient,
): Promise<ActivityTemplateRow[]> {
  const supabase = client ?? createClient();
  const { data, error } = await supabase
    .from("activity_templates")
    .select(TEMPLATE_COLUMNS)
    .eq("owner_scope", "system")
    .eq("status", "active")
    .order("name", { ascending: true });

  if (error) throw error;
  return (data ?? []) as ActivityTemplateRow[];
}

export interface ClassTemplateEnablementRow {
  template_id: string;
  /** true = a personal template added to the palette; false = a pruned system template. */
  enabled: boolean;
}

/** Every class-palette enablement row (both added-personal and pruned-system). */
export async function listClassTemplateEnablement(
  classDbId: string,
  client?: SupabaseClient,
): Promise<ClassTemplateEnablementRow[]> {
  const supabase = client ?? createClient();
  const { data, error } = await supabase
    .from("template_scope_enablement")
    .select("template_id, enabled")
    .eq("scope", "class")
    .eq("scope_id", classDbId);
  if (error) throw error;
  return (data ?? []) as ClassTemplateEnablementRow[];
}

/** The class-owned ("Class Templates") library — active rows for one class. */
export async function listClassTemplates(
  classDbId: string,
  client?: SupabaseClient,
): Promise<ActivityTemplateRow[]> {
  const supabase = client ?? createClient();
  const { data, error } = await supabase
    .from("activity_templates")
    .select(TEMPLATE_COLUMNS)
    .eq("owner_scope", "class")
    .eq("owner_class_id", classDbId)
    .eq("status", "active")
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as ActivityTemplateRow[];
}

/**
 * Fetch a single template by id. RLS decides readability (system / public /
 * your own user rows / class rows you co-teach). Returns null when absent or
 * unreadable — this powers the public share page (`/teacher/templates/:id`).
 */
export async function getTemplateById(
  id: string,
  client?: SupabaseClient,
): Promise<ActivityTemplateRow | null> {
  const supabase = client ?? createClient();
  const { data, error } = await supabase
    .from("activity_templates")
    .select(TEMPLATE_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return (data as ActivityTemplateRow | null) ?? null;
}

/**
 * The Phase 2 class palette (selectable activity types), a curated union of:
 *   - system templates the teacher hasn't pruned (default on; a `scope='class',
 *     enabled=false` row removes one from this class's dropdown),
 *   - the class's own class-owned templates (auto), and
 *   - personal templates a teacher explicitly added (`enabled=true` row).
 * No institution precedence / `allow_child_override` — that curation is Phase 3
 * (§8). System rows sort first, then everything else, each newest-first.
 */
export async function listAvailableTemplatesForClass(
  classDbId: string,
  client?: SupabaseClient,
): Promise<ActivityTemplateRow[]> {
  const supabase = client ?? createClient();

  // system + class-owned (need no enablement link).
  const autoQuery = supabase
    .from("activity_templates")
    .select(TEMPLATE_COLUMNS)
    .eq("status", "active")
    .or(
      `owner_scope.eq.system,and(owner_scope.eq.class,owner_class_id.eq.${classDbId})`,
    );

  const [autoRes, enablement] = await Promise.all([
    autoQuery,
    listClassTemplateEnablement(classDbId, supabase),
  ]);
  if (autoRes.error) throw autoRes.error;

  const prunedSystem = new Set(
    enablement.filter((r) => !r.enabled).map((r) => r.template_id),
  );
  const addedPersonal = enablement
    .filter((r) => r.enabled)
    .map((r) => r.template_id);

  // Drop system templates the teacher pruned from this class.
  const rows = ((autoRes.data ?? []) as ActivityTemplateRow[]).filter(
    (r) => !(r.owner_scope === "system" && prunedSystem.has(r.id)),
  );
  const seen = new Set(rows.map((r) => r.id));

  // Fetch the explicitly-added (personal) templates the union above didn't cover.
  const addedIds = addedPersonal.filter((id) => !seen.has(id));
  if (addedIds.length > 0) {
    const { data: added, error } = await supabase
      .from("activity_templates")
      .select(TEMPLATE_COLUMNS)
      .in("id", addedIds)
      .eq("status", "active");
    if (error) throw error;
    for (const r of (added ?? []) as ActivityTemplateRow[]) {
      if (!seen.has(r.id)) {
        rows.push(r);
        seen.add(r.id);
      }
    }
  }

  // System first, then the rest, newest-first within each group.
  return rows.sort((a, b) => {
    if (a.owner_scope !== b.owner_scope) {
      if (a.owner_scope === "system") return -1;
      if (b.owner_scope === "system") return 1;
    }
    return (b.updated_at ?? "").localeCompare(a.updated_at ?? "");
  });
}
