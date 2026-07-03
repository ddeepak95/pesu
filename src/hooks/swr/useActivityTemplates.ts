import useSWR, { mutate } from "swr";

import {
  listAvailableTemplatesForClass,
  listClassTemplateEnablement,
  listClassTemplates,
  listMyTemplates,
  listSystemTemplates,
  type ActivityTemplateRow,
  type ClassTemplateEnablementRow,
} from "@/lib/queries/activityTemplates";

/** Invalidate every cached activity-template query (call after a mutation). */
export function invalidateActivityTemplatesCache() {
  return mutate(
    (key) =>
      Array.isArray(key) &&
      typeof key[0] === "string" &&
      (key[0] === "availableTemplatesForClass" ||
        key[0] === "classTemplates" ||
        key[0] === "classTemplateEnablement" ||
        key[0] === "systemTemplates" ||
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

/** Class-palette enablement rows: pruned system + added personal. */
export function useClassTemplateEnablement(classDbId: string | null) {
  return useSWR<ClassTemplateEnablementRow[]>(
    classDbId ? ["classTemplateEnablement", classDbId] : null,
    () => listClassTemplateEnablement(classDbId!),
  );
}

/** The teacher's personal ("My Templates") library. */
export function useMyTemplates(userId: string | null) {
  return useSWR<ActivityTemplateRow[]>(
    userId ? ["myTemplates", userId] : null,
    () => listMyTemplates(userId!),
  );
}
