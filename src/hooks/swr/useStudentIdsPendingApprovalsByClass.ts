import useSWR from "swr";
import { getStudentIdsWithPendingApprovalsInClass } from "@/lib/queries/submissions";

/**
 * Students with any assignment submission awaiting approval in this class.
 * Enabled only when the Progress tab (or similar) turns on heavy class reads.
 */
export function useStudentIdsPendingApprovalsByClass(
  classDbId: string | null,
  enabled: boolean
) {
  return useSWR<string[]>(
    enabled && classDbId
      ? ["studentIdsPendingApprovalsByClass", classDbId]
      : null,
    async () => {
      const ids = await getStudentIdsWithPendingApprovalsInClass(classDbId!);
      return Array.from(ids).sort();
    }
  );
}
