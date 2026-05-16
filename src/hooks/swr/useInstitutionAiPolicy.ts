"use client";

import useSWR, { mutate } from "swr";

import { createClient } from "@/lib/supabase";
import { getInstitutionAiPolicy } from "@/lib/queries/aiInstitutionSettings";
import type { AiInstitutionPolicy } from "@/types/aiSettings";

export const aiInstitutionPolicyKeys = {
  institution: (id: string) => ["ai-institution-policy", id] as const,
};

export function invalidateInstitutionAiPolicy(institutionId?: string) {
  if (institutionId) {
    return mutate(aiInstitutionPolicyKeys.institution(institutionId));
  }
  return mutate((key) => Array.isArray(key) && key[0] === "ai-institution-policy");
}

export function useInstitutionAiPolicy(institutionId: string | null) {
  return useSWR<AiInstitutionPolicy>(
    institutionId ? aiInstitutionPolicyKeys.institution(institutionId) : null,
    () => getInstitutionAiPolicy(createClient(), institutionId!),
  );
}
