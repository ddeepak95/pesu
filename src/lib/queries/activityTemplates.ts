/**
 * Activity-template reads — Phase 2 of dev-docs/activity-templates-plan.md,
 * plus institution-level curation of system templates (added later).
 *
 * RLS-enforced reads for the personal + class + institution libraries and the
 * class/institution palettes. Mutations live in `src/lib/templates/actions.ts`
 * (gated server actions); this module is the read side, usable from client
 * components (default browser client) or server components (inject the
 * request-scoped server client).
 *
 * A system template's availability resolves through a 3-tier chain:
 *   platform `default_listed` -> institution override (`template_scope_enablement`,
 *   scope='institution') -> class override (scope='class'). Institution-owned
 * templates only need the class tier on top of their own `default_listed`
 * column (which the institution edits directly).
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
  /** Only meaningful for owner_scope='system': auto-in-every-class-palette vs opt-in. */
  default_listed: boolean;
  forked_from: string | null;
  upstream_synced_at: string | null;
  origin_author_id: string | null;
  origin_author_name: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

const TEMPLATE_COLUMNS =
  "id, name, description, definition, owner_scope, owner_user_id, owner_class_id, institution_id, visibility, status, default_listed, forked_from, upstream_synced_at, origin_author_id, origin_author_name, created_by, created_at, updated_at";

/** The teacher's personal ("My Activity Templates") library — active user-owned rows. */
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

/** All active templates owned by one institution. */
export async function listInstitutionTemplates(
  institutionId: string,
  client?: SupabaseClient,
): Promise<ActivityTemplateRow[]> {
  const supabase = client ?? createClient();
  const { data, error } = await supabase
    .from("activity_templates")
    .select(TEMPLATE_COLUMNS)
    .eq("owner_scope", "institution")
    .eq("institution_id", institutionId)
    .eq("status", "active")
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as ActivityTemplateRow[];
}

const OWNER_SCOPE_RANK: Record<TemplateOwnerScope, number> = {
  system: 0,
  institution: 1,
  class: 2,
  user: 2,
};

function sortByScopeThenRecency(rows: ActivityTemplateRow[]): ActivityTemplateRow[] {
  return rows.sort((a, b) => {
    const rankDiff = OWNER_SCOPE_RANK[a.owner_scope] - OWNER_SCOPE_RANK[b.owner_scope];
    if (rankDiff !== 0) return rankDiff;
    return (b.updated_at ?? "").localeCompare(a.updated_at ?? "");
  });
}

/**
 * All active system templates, with `default_listed` overwritten to this
 * institution's resolved value (its own override if one exists, else the
 * platform baseline) — so consumers reflect what this institution has
 * actually decided, not the raw platform-wide flag.
 */
async function listInstitutionResolvedSystemTemplates(
  institutionId: string,
  supabase: SupabaseClient,
): Promise<ActivityTemplateRow[]> {
  const [systemRes, enablement] = await Promise.all([
    supabase
      .from("activity_templates")
      .select(TEMPLATE_COLUMNS)
      .eq("owner_scope", "system")
      .eq("status", "active"),
    listInstitutionTemplateEnablement(institutionId, supabase),
  ]);
  if (systemRes.error) throw systemRes.error;

  const overrides = new Map(enablement.map((r) => [r.template_id, r.enabled]));
  return ((systemRes.data ?? []) as ActivityTemplateRow[]).map((t) => ({
    ...t,
    default_listed: overrides.get(t.id) ?? t.default_listed,
  }));
}

/**
 * The institution's resolved availability set (for its own settings summary):
 * system templates whose institution-resolved `default_listed` is true, plus
 * ALL of this institution's own authored templates unconditionally — an
 * institution's own content always shows to itself; `default_listed` on an
 * institution-owned row only governs propagation down to classes, not
 * visibility to the institution admin.
 */
export async function listAvailableTemplatesForInstitution(
  institutionId: string,
  client?: SupabaseClient,
): Promise<ActivityTemplateRow[]> {
  const supabase = client ?? createClient();

  const [resolvedSystem, institutionOwned] = await Promise.all([
    listInstitutionResolvedSystemTemplates(institutionId, supabase),
    listInstitutionTemplates(institutionId, supabase),
  ]);

  const rows = [
    ...resolvedSystem.filter((t) => t.default_listed),
    ...institutionOwned,
  ];
  return sortByScopeThenRecency(rows);
}

/**
 * Every template this institution can manage (for the "Manage Activity
 * Templates" page): ALL active system templates (regardless of their
 * resolved default-listed state — toggling one off shouldn't make it vanish
 * from the page you'd toggle it back on from), plus all of this institution's
 * own authored templates.
 */
export async function listManageableTemplatesForInstitution(
  institutionId: string,
  client?: SupabaseClient,
): Promise<ActivityTemplateRow[]> {
  const supabase = client ?? createClient();

  const [resolvedSystem, institutionOwned] = await Promise.all([
    listInstitutionResolvedSystemTemplates(institutionId, supabase),
    listInstitutionTemplates(institutionId, supabase),
  ]);

  return sortByScopeThenRecency([...resolvedSystem, ...institutionOwned]);
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

export interface InstitutionTemplateEnablementRow {
  template_id: string;
  /** Institution-level override of a system template's default_listed baseline. */
  enabled: boolean;
}

/** Every institution-level system-template override row for one institution. */
export async function listInstitutionTemplateEnablement(
  institutionId: string,
  client?: SupabaseClient,
): Promise<InstitutionTemplateEnablementRow[]> {
  const supabase = client ?? createClient();
  const { data, error } = await supabase
    .from("template_scope_enablement")
    .select("template_id, enabled")
    .eq("scope", "institution")
    .eq("scope_id", institutionId);
  if (error) throw error;
  return (data ?? []) as InstitutionTemplateEnablementRow[];
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
 * unreadable — this powers the public share page (`/teacher/activity-templates/:id`).
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
 * The class palette (selectable activity types), a curated union of:
 *   - system templates resolved available for this class (platform
 *     `default_listed` baseline, overridable by the class's institution,
 *     overridable again by the class itself),
 *   - this class's own institution's templates resolved available (their own
 *     `default_listed` baseline, overridable by the class),
 *   - the class's own class-owned templates (always in, no chain), and
 *   - personal templates a teacher explicitly added (`enabled=true` row).
 * System rows sort first, then institution, then the rest, newest-first
 * within each group.
 */
export async function listAvailableTemplatesForClass(
  classDbId: string,
  client?: SupabaseClient,
): Promise<ActivityTemplateRow[]> {
  const supabase = client ?? createClient();

  const { data: classRow, error: classErr } = await supabase
    .from("classes")
    .select("institution_id")
    .eq("id", classDbId)
    .maybeSingle();
  if (classErr) throw classErr;
  const institutionId = classRow?.institution_id as string | null | undefined;

  // System + this class's institution's templates + class-owned, fetched
  // unconditionally (no default_listed filter) — availability is resolved in
  // JS below via the platform -> institution -> class override chain.
  const baseFilters = [
    "owner_scope.eq.system",
    `and(owner_scope.eq.class,owner_class_id.eq.${classDbId})`,
  ];
  if (institutionId) {
    baseFilters.push(
      `and(owner_scope.eq.institution,institution_id.eq.${institutionId})`,
    );
  }
  const baseQuery = supabase
    .from("activity_templates")
    .select(TEMPLATE_COLUMNS)
    .eq("status", "active")
    .or(baseFilters.join(","));

  const [baseRes, classEnablement, institutionEnablement] = await Promise.all([
    baseQuery,
    listClassTemplateEnablement(classDbId, supabase),
    institutionId
      ? listInstitutionTemplateEnablement(institutionId, supabase)
      : Promise.resolve([]),
  ]);
  if (baseRes.error) throw baseRes.error;

  const institutionOverride = new Map(
    institutionEnablement.map((r) => [r.template_id, r.enabled]),
  );
  const classOverride = new Map(
    classEnablement.map((r) => [r.template_id, r.enabled]),
  );

  function isResolvedAvailable(row: ActivityTemplateRow): boolean {
    if (row.owner_scope === "class") return true;
    let value = row.default_listed;
    if (row.owner_scope === "system" && institutionOverride.has(row.id)) {
      value = institutionOverride.get(row.id)!;
    }
    if (classOverride.has(row.id)) {
      value = classOverride.get(row.id)!;
    }
    return value;
  }

  const rows = ((baseRes.data ?? []) as ActivityTemplateRow[]).filter(
    isResolvedAvailable,
  );
  const seen = new Set(rows.map((r) => r.id));

  // Fetch any explicitly-added (class-scope enabled=true) template the base
  // query didn't cover — in practice, personal templates, plus the rare case
  // of a class adding a system/institution template outside its own institution.
  const addedIds = [...classOverride.entries()]
    .filter(([id, enabled]) => enabled && !seen.has(id))
    .map(([id]) => id);
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

  // Broadest scope first (system, then institution), then the rest, newest-first within each group.
  const scopeRank: Record<TemplateOwnerScope, number> = {
    system: 0,
    institution: 1,
    class: 2,
    user: 2,
  };
  return rows.sort((a, b) => {
    const rankDiff = scopeRank[a.owner_scope] - scopeRank[b.owner_scope];
    if (rankDiff !== 0) return rankDiff;
    return (b.updated_at ?? "").localeCompare(a.updated_at ?? "");
  });
}
