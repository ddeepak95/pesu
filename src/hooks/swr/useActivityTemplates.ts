import useSWR, { mutate } from "swr";

import {
  listAvailableTemplatesForClass,
  listAvailableTemplatesForInstitution,
  listClassTemplateEnablement,
  listClassTemplates,
  listInstitutionTemplateEnablement,
  listInstitutionTemplates,
  listManageableTemplatesForInstitution,
  listMyTemplates,
  listSystemTemplates,
  type ActivityTemplateRow,
  type ClassTemplateEnablementRow,
  type InstitutionTemplateEnablementRow,
} from "@/lib/queries/activityTemplates";

/** Invalidate every cached activity-template query (call after a mutation). */
export function invalidateActivityTemplatesCache() {
  return mutate(
    (key) =>
      Array.isArray(key) &&
      typeof key[0] === "string" &&
      (key[0] === "availableTemplatesForClass" ||
        key[0] === "availableTemplatesForInstitution" ||
        key[0] === "manageableTemplatesForInstitution" ||
        key[0] === "classTemplates" ||
        key[0] === "classTemplateEnablement" ||
        key[0] === "institutionTemplateEnablement" ||
        key[0] === "systemTemplates" ||
        key[0] === "institutionTemplates" ||
        key[0] === "myTemplates"),
  );
}

/** The class palette: system + class-owned + added-personal (§8). */
export function useAvailableTemplatesForClass(classDbId: string | null) {
  return useSWR<ActivityTemplateRow[]>(
    classDbId ? ["availableTemplatesForClass", classDbId] : null,
    () => listAvailableTemplatesForClass(classDbId!),
  );
}

/** The class-owned ("Class Templates") library. */
export function useClassTemplates(classDbId: string | null) {
  return useSWR<ActivityTemplateRow[]>(
    classDbId ? ["classTemplates", classDbId] : null,
    () => listClassTemplates(classDbId!),
  );
}

/** All active system templates (the built-in activity types). */
export function useSystemTemplates() {
  return useSWR<ActivityTemplateRow[]>(["systemTemplates"], () =>
    listSystemTemplates(),
  );
}

/** All active templates owned by one institution. */
export function useInstitutionTemplates(institutionId: string | null) {
  return useSWR<ActivityTemplateRow[]>(
    institutionId ? ["institutionTemplates", institutionId] : null,
    () => listInstitutionTemplates(institutionId!),
  );
}

/** Class-palette enablement rows: pruned system + added personal. */
export function useClassTemplateEnablement(classDbId: string | null) {
  return useSWR<ClassTemplateEnablementRow[]>(
    classDbId ? ["classTemplateEnablement", classDbId] : null,
    () => listClassTemplateEnablement(classDbId!),
  );
}

/** Institution-level overrides of system templates' default_listed baseline. */
export function useInstitutionTemplateEnablement(institutionId: string | null) {
  return useSWR<InstitutionTemplateEnablementRow[]>(
    institutionId ? ["institutionTemplateEnablement", institutionId] : null,
    () => listInstitutionTemplateEnablement(institutionId!),
  );
}

/** The institution's resolved availability set: system (resolved) + all institution-owned. */
export function useAvailableTemplatesForInstitution(institutionId: string | null) {
  return useSWR<ActivityTemplateRow[]>(
    institutionId ? ["availableTemplatesForInstitution", institutionId] : null,
    () => listAvailableTemplatesForInstitution(institutionId!),
  );
}

/**
 * Every template this institution can manage: ALL system templates
 * (regardless of resolved state) + all institution-owned templates. Backs
 * the "Manage Activity Templates" page so toggling a template off doesn't
 * remove its row — only the resolved-availability view
 * (`useAvailableTemplatesForInstitution`) filters to what's currently on.
 */
export function useManageableTemplatesForInstitution(institutionId: string | null) {
  return useSWR<ActivityTemplateRow[]>(
    institutionId ? ["manageableTemplatesForInstitution", institutionId] : null,
    () => listManageableTemplatesForInstitution(institutionId!),
  );
}

/** The teacher's personal ("My Templates") library. */
export function useMyTemplates(userId: string | null) {
  return useSWR<ActivityTemplateRow[]>(
    userId ? ["myTemplates", userId] : null,
    () => listMyTemplates(userId!),
  );
}
