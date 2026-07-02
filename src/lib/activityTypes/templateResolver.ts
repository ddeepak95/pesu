/**
 * Template resolver — Phase 0 of dev-docs/activity-templates-plan.md.
 *
 * Thin, synchronous wrapper around the registry, establishing the call-site
 * seam Phase 1 will fill with a real DB-backed async lookup (by templateId)
 * without touching call sites again. Today it always resolves by `kind` from
 * the hardcoded registry.
 */

import { getActivityTypeDefinition } from "./registry";
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
