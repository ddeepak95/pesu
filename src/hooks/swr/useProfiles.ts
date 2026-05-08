import useSWR from "swr";
import {
  getAllStudentProfiles,
  getProfileFieldsForClass,
  getStudentProfile,
} from "@/lib/queries/profileFields";
import { ProfileField, StudentProfile } from "@/types/profileFields";

/**
 * Fetch all profile fields configured for a class
 */
export function useProfileFieldsForClass(classDbId: string | null) {
  return useSWR<ProfileField[]>(
    classDbId ? ["profileFields", classDbId] : null,
    () => getProfileFieldsForClass(classDbId!)
  );
}

/**
 * Fetch a student's profile for a class
 */
export function useStudentProfileData(
  classDbId: string | null,
  studentId: string | null
) {
  return useSWR<StudentProfile | null>(
    classDbId && studentId
      ? ["studentProfile", classDbId, studentId]
      : null,
    () => getStudentProfile(classDbId!, studentId!)
  );
}

/**
 * Fetch every student's profile responses for a class.
 */
export function useAllStudentProfiles(classDbId: string | null) {
  return useSWR<StudentProfile[]>(
    classDbId ? ["allStudentProfiles", classDbId] : null,
    () => getAllStudentProfiles(classDbId!)
  );
}
