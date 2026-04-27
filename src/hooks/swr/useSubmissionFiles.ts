import useSWR, { mutate } from "swr";
import { getSubmissionFiles } from "@/lib/queries/submissionFiles";
import { SubmissionFile } from "@/types/submission";

/**
 * Fetch all files attached to a submission.
 */
export function useSubmissionFiles(submissionId: string | null) {
  return useSWR<SubmissionFile[]>(
    submissionId ? ["submissionFiles", submissionId] : null,
    () => getSubmissionFiles(submissionId!)
  );
}

/**
 * Invalidate every cached submission-files query (call after upload/delete).
 */
export function invalidateSubmissionFilesCache() {
  return mutate(
    (key) =>
      Array.isArray(key) &&
      typeof key[0] === "string" &&
      key[0] === "submissionFiles"
  );
}
