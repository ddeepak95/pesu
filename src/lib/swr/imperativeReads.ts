/**
 * Escape hatch for imperative Supabase reads inside event handlers and
 * one-shot session-initialization flows.
 *
 * The default convention (see AGENTS.md) is for client-side reads to flow
 * through SWR hooks under `src/hooks/swr/**`, which automatically participate
 * in the global loading overlay via the SWR middleware. A handful of flows
 * (session restore, integrity-revocation handlers, etc.) are genuinely
 * procedural and don't fit the "key drives fetcher" model. They should still
 * surface a global loader, so they go through `runTracked` here, which
 * manually increments and decrements the same busy store.
 *
 * The imports below are explicitly allowed (the no-restricted-imports lint
 * rule applies to `src/components/**` and `src/app/**\/*Client*`, not to
 * helpers under `src/lib`), so call sites can import these wrappers without
 * needing per-line lint suppressions.
 */

import { countContentItemPlacementsByRef } from "@/lib/queries/contentItems";
import {
  getSubmissionById,
  getSubmissionByStudentAndAssignment,
  getSubmissionForSessionRestore,
  getTranscriptsForSubmission,
} from "@/lib/queries/submissions";
import type { ContentItem } from "@/types/contentItem";
import { getSubmissionFiles } from "@/lib/queries/submissionFiles";
import { increment, decrement } from "./busyStore";

/**
 * Run an imperative async read and have it contribute to the global busy
 * counter (and therefore the loading overlay) for its duration.
 */
export async function runTracked<T>(fn: () => Promise<T>): Promise<T> {
  increment();
  try {
    return await fn();
  } finally {
    decrement();
  }
}

export function fetchSubmissionByIdTracked(submissionId: string) {
  return runTracked(() => getSubmissionById(submissionId));
}

export function fetchSubmissionByStudentAndAssignmentTracked(
  studentId: string,
  assignmentId: string
) {
  return runTracked(() =>
    getSubmissionByStudentAndAssignment(studentId, assignmentId)
  );
}

export function fetchSubmissionForSessionRestoreTracked(submissionId: string) {
  return runTracked(() => getSubmissionForSessionRestore(submissionId));
}

export function fetchTranscriptsForSubmissionTracked(submissionId: string) {
  return runTracked(() => getTranscriptsForSubmission(submissionId));
}

export function fetchSubmissionFilesTracked(submissionId: string) {
  return runTracked(() => getSubmissionFiles(submissionId));
}

/** Imperative read for delete/unlink confirm flows (teacher detail & content list). */
export function countContentItemPlacementsByRefTracked(params: {
  classId: string;
  type: ContentItem["type"];
  refId: string;
}) {
  return runTracked(() => countContentItemPlacementsByRef(params));
}
