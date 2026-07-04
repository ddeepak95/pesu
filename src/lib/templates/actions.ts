"use server";

import "server-only";

import { revalidatePath } from "next/cache";

import { verifySession, requireSuperAdmin, requireInstitutionAdminOrSuper } from "@/lib/dal";
import { templateDefinitionSchema } from "@/lib/activityTypes/templates";

/**
 * Activity-template mutations — Phase 2 of dev-docs/activity-templates-plan.md.
 *
 * The gated write side of the personal + class + system + institution
 * libraries. Ownership is set by create/clone-in-context (§7.2); edit rights
 * come from ownership only (§4). RLS (`activity_templates_write`) is the real
 * enforcement — a class write requires co-teaching `owner_class_id`, a user
 * write requires owning the row, a system write requires
 * `is_platform_super_admin()`, an institution write requires
 * `is_institution_admin(institution_id)` — so these actions add validation,
 * the flat-clone invariant, and clear errors on top, rather than re-deriving
 * the authorization. `definition` is validated with the same zod schema used
 * on read, so a malformed template can never be persisted.
 *
 * System- and institution-owned creation additionally call
 * `requireSuperAdmin()` / `requireInstitutionAdminOrSuper()` explicitly (RLS
 * already blocks unauthorized writes, this just gives a clean error instead
 * of a DB rejection).
 */

const TEMPLATES_PATH = "/teacher/activity-templates";
const SYSTEM_TEMPLATES_PATH = "/platform/activity-templates";

function institutionTemplatesPaths(institutionId: string): string[] {
  return [
    `/platform/institutions/${institutionId}`,
    `/admin/institutions/${institutionId}`,
  ];
}

type CreateScope = "user" | "class" | "system" | "institution";

export async function createTemplate(input: {
  scope: CreateScope;
  classId?: string;
  institutionId?: string;
  name: string;
  description?: string | null;
  visibility?: "private" | "public";
  definition: unknown;
}): Promise<{ id: string }> {
  if (input.scope === "institution" && !input.institutionId) {
    throw new Error("An institution is required to create an institution-owned template.");
  }

  const { user, supabase } =
    input.scope === "system"
      ? await requireSuperAdmin()
      : input.scope === "institution"
        ? await requireInstitutionAdminOrSuper(input.institutionId!)
        : await verifySession();

  const definition = templateDefinitionSchema.parse(input.definition);
  const name = input.name.trim();
  if (!name) throw new Error("Template name is required.");

  const row: Record<string, unknown> = {
    name,
    description: input.description ?? null,
    definition,
    visibility: input.visibility ?? "private",
    status: "active",
    created_by: user.id,
  };

  if (input.scope === "user") {
    row.owner_scope = "user";
    row.owner_user_id = user.id;
  } else if (input.scope === "system") {
    row.owner_scope = "system";
  } else if (input.scope === "institution") {
    row.owner_scope = "institution";
    row.institution_id = input.institutionId;
  } else {
    if (!input.classId) {
      throw new Error("A class is required to create a class-owned template.");
    }
    row.owner_scope = "class";
    row.owner_class_id = input.classId;
  }

  const { data, error } = await supabase
    .from("activity_templates")
    .insert(row)
    .select("id")
    .single();
  if (error) throw error;

  if (input.scope === "system") {
    revalidatePath(SYSTEM_TEMPLATES_PATH);
  } else if (input.scope === "institution") {
    for (const path of institutionTemplatesPaths(input.institutionId!)) {
      revalidatePath(path);
    }
  } else {
    revalidatePath(TEMPLATES_PATH);
  }
  return { id: data.id as string };
}

/**
 * Flat clone (§7.4): copy a canonical source into the destination library. You
 * can only clone a source whose own `forked_from IS NULL` — clones form a flat
 * star, not a tree. The original author is cached (`origin_author_*`) so credit
 * survives the source being deleted.
 */
export async function cloneTemplate(input: {
  sourceId: string;
  destScope: CreateScope;
  classId?: string;
}): Promise<{ id: string }> {
  const { user, supabase } = await verifySession();

  const { data: source, error: srcErr } = await supabase
    .from("activity_templates")
    .select(
      "id, name, description, definition, forked_from, origin_author_id, origin_author_name, created_by",
    )
    .eq("id", input.sourceId)
    .maybeSingle();
  if (srcErr) throw srcErr;
  if (!source) throw new Error("Source template not found or not readable.");
  if (source.forked_from) {
    throw new Error(
      "You can only clone the original template, not a clone — clone the source it came from instead.",
    );
  }

  const definition = templateDefinitionSchema.parse(source.definition);

  const row: Record<string, unknown> = {
    name: source.name,
    description: source.description ?? null,
    definition,
    visibility: "private",
    status: "active",
    forked_from: source.id,
    upstream_synced_at: new Date().toISOString(),
    origin_author_id: source.origin_author_id ?? source.created_by ?? null,
    origin_author_name: source.origin_author_name ?? null,
    created_by: user.id,
  };

  if (input.destScope === "user") {
    row.owner_scope = "user";
    row.owner_user_id = user.id;
  } else {
    if (!input.classId) {
      throw new Error("A class is required to clone into a class library.");
    }
    row.owner_scope = "class";
    row.owner_class_id = input.classId;
  }

  const { data, error } = await supabase
    .from("activity_templates")
    .insert(row)
    .select("id")
    .single();
  if (error) throw error;

  revalidatePath(TEMPLATES_PATH);
  return { id: data.id as string };
}

export async function updateTemplate(
  id: string,
  patch: { name?: string; description?: string | null; definition?: unknown },
): Promise<void> {
  const { supabase } = await verifySession();

  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) throw new Error("Template name is required.");
    update.name = name;
  }
  if (patch.description !== undefined) update.description = patch.description;
  if (patch.definition !== undefined) {
    update.definition = templateDefinitionSchema.parse(patch.definition);
  }

  const { error } = await supabase
    .from("activity_templates")
    .update(update)
    .eq("id", id);
  if (error) throw error;

  revalidatePath(TEMPLATES_PATH);
  revalidatePath(SYSTEM_TEMPLATES_PATH);
}

/**
 * Pull upstream (§7.4): re-copy the canonical source's `definition` into this
 * clone (confirm-then-overwrite; no diff/merge). Stamps `upstream_synced_at`.
 */
export async function pullUpstream(templateId: string): Promise<void> {
  const { supabase } = await verifySession();

  const { data: clone, error } = await supabase
    .from("activity_templates")
    .select("id, forked_from")
    .eq("id", templateId)
    .maybeSingle();
  if (error) throw error;
  if (!clone) throw new Error("Template not found or not editable.");
  if (!clone.forked_from) {
    throw new Error("This template has no upstream source to pull from.");
  }

  const { data: source, error: srcErr } = await supabase
    .from("activity_templates")
    .select("definition")
    .eq("id", clone.forked_from)
    .maybeSingle();
  if (srcErr) throw srcErr;
  if (!source) throw new Error("The upstream source is no longer available.");

  const definition = templateDefinitionSchema.parse(source.definition);
  const now = new Date().toISOString();
  const { error: updErr } = await supabase
    .from("activity_templates")
    .update({ definition, upstream_synced_at: now, updated_at: now })
    .eq("id", templateId);
  if (updErr) throw updErr;

  revalidatePath(TEMPLATES_PATH);
}

/**
 * Publish as new (§7.4): clear `forked_from` to mint a fresh canonical source
 * from a customized clone. `origin_author_*` is kept as inspiration credit.
 */
export async function publishAsNewTemplate(
  cloneId: string,
  opts?: { visibility?: "private" | "public" },
): Promise<void> {
  const { supabase } = await verifySession();
  const { error } = await supabase
    .from("activity_templates")
    .update({
      forked_from: null,
      upstream_synced_at: null,
      visibility: opts?.visibility ?? "public",
      updated_at: new Date().toISOString(),
    })
    .eq("id", cloneId);
  if (error) throw error;

  revalidatePath(TEMPLATES_PATH);
}

export async function setTemplateVisibility(
  id: string,
  visibility: "private" | "public",
): Promise<void> {
  const { supabase } = await verifySession();
  const { error } = await supabase
    .from("activity_templates")
    .update({ visibility, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;

  revalidatePath(TEMPLATES_PATH);
  revalidatePath(SYSTEM_TEMPLATES_PATH);
}

export async function archiveTemplate(id: string): Promise<void> {
  const { supabase } = await verifySession();
  const { error } = await supabase
    .from("activity_templates")
    .update({ status: "archived", updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;

  revalidatePath(TEMPLATES_PATH);
  revalidatePath(SYSTEM_TEMPLATES_PATH);
}

export async function restoreTemplate(id: string): Promise<void> {
  const { supabase } = await verifySession();
  const { error } = await supabase
    .from("activity_templates")
    .update({ status: "active", updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;

  revalidatePath(TEMPLATES_PATH);
  revalidatePath(SYSTEM_TEMPLATES_PATH);
}

// ---------------------------------------------------------------------------
// Availability (class palette) — the second axis (§8). "Add to class" is a pure
// membership LINK, never a copy: it makes a template selectable in a class
// without changing its ownership. RLS (`template_scope_enablement_write`) gates
// this to class-config managers. System + class-owned templates need no link
// (they're always in the palette); this is for adding a PERSONAL template.
// ---------------------------------------------------------------------------
export async function addTemplateToClass(
  classId: string,
  templateId: string,
): Promise<void> {
  const { user, supabase } = await verifySession();
  const { error } = await supabase.from("template_scope_enablement").upsert(
    {
      scope: "class",
      scope_id: classId,
      template_id: templateId,
      enabled: true,
      added_by: user.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "scope,scope_id,template_id" },
  );
  if (error) throw error;
}

export async function removeTemplateFromClass(
  classId: string,
  templateId: string,
): Promise<void> {
  const { supabase } = await verifySession();
  const { error } = await supabase
    .from("template_scope_enablement")
    .delete()
    .eq("scope", "class")
    .eq("scope_id", classId)
    .eq("template_id", templateId);
  if (error) throw error;
}

export type AvailabilityScope =
  | { kind: "class"; classId: string }
  | { kind: "institution"; institutionId: string };

/**
 * Curate which default-listed (system or institution) activity types appear
 * in a class's or institution's picker (§8). A template's `default_listed`
 * column is its platform/institution-authored baseline; this writes an
 * override row only when `available` diverges from the *resolved* baseline
 * for `scope`, and deletes any existing row when it matches (back to the
 * inherited baseline).
 *
 * For a class-scope toggle on a `system` template, the resolved baseline
 * additionally accounts for the class's own institution's override (if any)
 * — so a class's toggle diffs against what the institution has already
 * decided, not the raw platform-wide flag. Institution-scope toggles (and
 * class-scope toggles on institution-owned templates) diff directly against
 * the template's own `default_listed` column — there's no tier above them.
 */
export async function setTemplateAvailability(
  scope: AvailabilityScope,
  templateId: string,
  available: boolean,
): Promise<void> {
  const { user, supabase } =
    scope.kind === "institution"
      ? await requireInstitutionAdminOrSuper(scope.institutionId)
      : await verifySession();

  const { data: template, error: templateErr } = await supabase
    .from("activity_templates")
    .select("owner_scope, default_listed")
    .eq("id", templateId)
    .maybeSingle();
  if (templateErr) throw templateErr;
  if (!template) throw new Error("Template not found or not readable.");

  let baseline = template.default_listed;

  if (scope.kind === "class" && template.owner_scope === "system") {
    const { data: classRow, error: classErr } = await supabase
      .from("classes")
      .select("institution_id")
      .eq("id", scope.classId)
      .maybeSingle();
    if (classErr) throw classErr;
    const institutionId = classRow?.institution_id as string | null | undefined;
    if (institutionId) {
      const { data: instRow, error: instErr } = await supabase
        .from("template_scope_enablement")
        .select("enabled")
        .eq("scope", "institution")
        .eq("scope_id", institutionId)
        .eq("template_id", templateId)
        .maybeSingle();
      if (instErr) throw instErr;
      baseline = instRow?.enabled ?? template.default_listed;
    }
  }

  const scopeCol = scope.kind;
  const scopeId = scope.kind === "class" ? scope.classId : scope.institutionId;

  if (available === baseline) {
    const { error } = await supabase
      .from("template_scope_enablement")
      .delete()
      .eq("scope", scopeCol)
      .eq("scope_id", scopeId)
      .eq("template_id", templateId);
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from("template_scope_enablement").upsert(
    {
      scope: scopeCol,
      scope_id: scopeId,
      template_id: templateId,
      enabled: available,
      added_by: user.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "scope,scope_id,template_id" },
  );
  if (error) throw error;
}

/**
 * Whether a system or institution template is automatically in every class's
 * palette (platform-wide for system, institution-wide for institution), or
 * opt-in (available in "Add from Library" but requires an explicit per-class
 * add). Pass `institutionId` when toggling an institution-owned template so
 * an institution admin can be gated in instead of requiring a super admin —
 * RLS (`activity_templates_write`) is the real enforcement either way, this
 * just gives a clean error instead of a DB rejection.
 */
export async function setTemplateDefaultListed(
  templateId: string,
  defaultListed: boolean,
  opts?: { institutionId?: string },
): Promise<void> {
  const { supabase } = opts?.institutionId
    ? await requireInstitutionAdminOrSuper(opts.institutionId)
    : await requireSuperAdmin();
  const { error } = await supabase
    .from("activity_templates")
    .update({ default_listed: defaultListed, updated_at: new Date().toISOString() })
    .eq("id", templateId);
  if (error) throw error;

  if (opts?.institutionId) {
    for (const path of institutionTemplatesPaths(opts.institutionId)) {
      revalidatePath(path);
    }
  } else {
    revalidatePath(SYSTEM_TEMPLATES_PATH);
  }
}
