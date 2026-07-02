/**
 * Template resolver — Phase 0 of dev-docs/activity-templates-plan.md.
 *
 * Thin, synchronous wrapper around the registry, establishing the call-site
 * seam Phase 1 will fill with a real DB-backed async lookup (by templateId)
 * without touching call sites again. Today it always resolves by `kind` from
 * the hardcoded registry.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { getActivityTypeDefinition } from "./registry";
import {
  SYSTEM_TEMPLATE_IDS,
  SYSTEM_TEMPLATE_ID_TO_KIND,
  normalizeDefinition,
} from "./templates";
import type { ActivityTypeDefinition, ActivityTypeKind } from "./types";

/** A fully-resolved activity-type definition. */
export interface ResolvedTemplate {
  kind: ActivityTypeKind;
  /** Present once Phase 1 lands DB templates; always undefined in Phase 0. */
  templateId?: string;
  definition: ActivityTypeDefinition;
}

export interface ResolveTemplateRef {
  kind: ActivityTypeKind;
  /** Reserved for Phase 1; accepted now so call sites don't need to change signature later. */
  templateId?: string;
}

/**
 * Phase 0: always resolves from the registry by kind (templateId is accepted
 * but ignored — Phase 1 adds the DB lookup here, behind this same signature).
 */
export function resolveActivityTemplate(ref: ResolveTemplateRef): ResolvedTemplate {
  return {
    kind: ref.kind,
    templateId: undefined,
    definition: getActivityTypeDefinition(ref.kind),
  };
}

/**
 * Phase 1: DB-preferring resolver. Fetches the template by explicit id (or the
 * built-in kind's seeded system-row id), validates the stored `definition` with
 * the shared zod schema, and reconstructs a normalized `ResolvedTemplate`. Falls
 * back to the registry when the row is missing or malformed — so the app still
 * works if a template is absent (mirrors the settings resolver's safe fallback).
 *
 * Takes the Supabase client by injection so this module stays pure/client-safe
 * (no server-only import) and testable. Consumed from Phase 2 on (seed/pull
 * time); the assignment builder still snapshots the registry-derived definition,
 * which is identical to the seeded system row by construction.
 */
export async function resolveActivityTemplateFromDb(
  supabase: SupabaseClient,
  ref: ResolveTemplateRef,
): Promise<ResolvedTemplate> {
  const id =
    ref.templateId ?? (ref.kind ? SYSTEM_TEMPLATE_IDS[ref.kind] : undefined);

  if (id) {
    const { data } = await supabase
      .from("activity_templates")
      .select("id, name, definition, status")
      .eq("id", id)
      .maybeSingle();

    if (data && data.status !== "archived") {
      const definition = normalizeDefinition(data.definition);
      if (definition) {
        const kind =
          SYSTEM_TEMPLATE_ID_TO_KIND[data.id] ?? ref.kind ?? "learning";
        return {
          kind,
          templateId: data.id,
          // Reconstruct the registry-shaped definition (the DB variant drops
          // `kind`/`label`, which are the row's identity/columns).
          definition: { ...definition, kind, label: data.name },
        };
      }
    }
  }

  return resolveActivityTemplate({ kind: ref.kind ?? "learning" });
}
