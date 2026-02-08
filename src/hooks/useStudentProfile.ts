"use client";

import { useMemo } from "react";
import { ProfileField } from "@/types/profileFields";
import { useProfileFieldsForClass, useStudentProfileData } from "@/hooks/swr";

interface UseStudentProfileResult {
  /** All profile fields configured for the class */
  fields: ProfileField[];
  /** Student's responses keyed by field ID */
  responses: Record<string, string>;
  /** Computed display name from the field marked as is_display_name, or null */
  displayName: string | null;
  /** Whether all mandatory fields have been filled */
  hasCompletedRequired: boolean;
  /** Loading state */
  loading: boolean;
  /** Error message, if any */
  error: string | null;
  /** Refetch profile data */
  refetch: () => Promise<void>;
}

/**
 * Hook that fetches and exposes student profile data for a class.
 * Provides fields, responses, computed display name, and completion status.
 * Now powered by SWR for automatic caching and deduplication.
 */
export function useStudentProfile(
  classDbId: string,
  studentId: string
): UseStudentProfileResult {
  const {
    data: fields = [],
    error: fieldsError,
    isLoading: fieldsLoading,
    mutate: mutateFields,
  } = useProfileFieldsForClass(classDbId || null);

  const {
    data: studentProfile,
    error: profileError,
    isLoading: profileLoading,
    mutate: mutateProfile,
  } = useStudentProfileData(classDbId || null, studentId || null);

  const responses = studentProfile?.field_responses ?? {};
  const loading = fieldsLoading || profileLoading;
  const error = fieldsError?.message || profileError?.message || null;

  // Compute display name from the field marked as is_display_name
  const displayName = useMemo(() => {
    const displayNameField = fields.find((f) => f.is_display_name);
    return displayNameField ? responses[displayNameField.id] || null : null;
  }, [fields, responses]);

  // Check if all mandatory fields have non-empty responses
  const hasCompletedRequired = useMemo(() => {
    if (fields.length === 0) return true;
    return fields
      .filter((f) => f.is_mandatory)
      .every((f) => {
        const response = responses[f.id];
        return response && response.trim() !== "";
      });
  }, [fields, responses]);

  const refetch = async () => {
    await Promise.all([mutateFields(), mutateProfile()]);
  };

  return {
    fields,
    responses,
    displayName,
    hasCompletedRequired,
    loading,
    error,
    refetch,
  };
}
