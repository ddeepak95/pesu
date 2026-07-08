"use client";

import useSWR, { mutate } from "swr";

import { createClient } from "@/lib/supabase";
import { getClassAiOverride } from "@/lib/queries/aiClassSettings";
import type { AiClassOverridePolicy } from "@/types/aiSettings";

export const classAiOverrideKeys = {
  class: (id: string) => ["ai-class-override", id] as const,
};

export function invalidateClassAiOverride(classDbId?: string) {
  if (classDbId) {
    return mutate(classAiOverrideKeys.class(classDbId));
  }
  return mutate((key) => Array.isArray(key) && key[0] === "ai-class-override");
}

export function useClassAiOverride(classDbId: string | null) {
  return useSWR<AiClassOverridePolicy>(
    classDbId ? classAiOverrideKeys.class(classDbId) : null,
    () => getClassAiOverride(createClient(), classDbId!),
  );
}
