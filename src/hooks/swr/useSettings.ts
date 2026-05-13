import useSWR, { mutate } from "swr";
import { createClient } from "@/lib/supabase";
import {
  getEffectiveSettingsForClass,
  getEffectiveSettingsForInstitution,
} from "@/lib/queries/settings";
import type { EffectiveSettings } from "@/lib/settings/resolve";

/**
 * Tagged invalidator — drop after any setting mutation. Both institution and
 * class caches are invalidated since a parent change can cascade to children.
 */
export function invalidateSettingsCache() {
  return mutate(
    (key) =>
      Array.isArray(key) &&
      typeof key[0] === "string" &&
      (key[0] === "effectiveInstitutionSettings" ||
        key[0] === "effectiveClassSettings")
  );
}

export function useEffectiveInstitutionSettings(institutionId: string | null) {
  return useSWR<EffectiveSettings>(
    institutionId ? ["effectiveInstitutionSettings", institutionId] : null,
    () => getEffectiveSettingsForInstitution(createClient(), institutionId!)
  );
}

export function useEffectiveClassSettings(classDbId: string | null) {
  return useSWR<EffectiveSettings>(
    classDbId ? ["effectiveClassSettings", classDbId] : null,
    () => getEffectiveSettingsForClass(createClient(), classDbId!)
  );
}
