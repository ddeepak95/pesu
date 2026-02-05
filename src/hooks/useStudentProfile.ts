"use client";

import { useState, useEffect, useCallback } from "react";
import { ProfileField } from "@/types/profileFields";
import {
  getProfileFieldsForClass,
  getStudentProfile,
} from "@/lib/queries/profileFields";

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
 */
export function useStudentProfile(
  classDbId: string,
  studentId: string
): UseStudentProfileResult {
  const [fields, setFields] = useState<ProfileField[]>([]);
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProfile = useCallback(async () => {
    if (!classDbId || !studentId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [profileFields, studentProfile] = await Promise.all([
        getProfileFieldsForClass(classDbId),
        getStudentProfile(classDbId, studentId),
      ]);

      setFields(profileFields);
      setResponses(studentProfile?.field_responses ?? {});
    } catch (err) {
      console.error("Error fetching student profile:", err);
      setError("Failed to load profile data");
    } finally {
      setLoading(false);
    }
  }, [classDbId, studentId]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  // Compute display name from the field marked as is_display_name
  const displayNameField = fields.find((f) => f.is_display_name);
  const displayName = displayNameField
    ? responses[displayNameField.id] || null
    : null;

  // Check if all mandatory fields have non-empty responses
  const hasCompletedRequired =
    fields.length === 0 ||
    fields
      .filter((f) => f.is_mandatory)
      .every((f) => {
        const response = responses[f.id];
        return response && response.trim() !== "";
      });

  return {
    fields,
    responses,
    displayName,
    hasCompletedRequired,
    loading,
    error,
    refetch: fetchProfile,
  };
}
