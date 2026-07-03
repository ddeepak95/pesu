/**
 * Session storage utility for managing assignment progress persistence
 * Uses localStorage with assignment-specific keys
 */

export interface AssignmentSession {
  submissionId: string;
  studentName?: string; // Optional - not always available, and we get it from submission anyway
  preferredLanguage: string;
  currentQuestionIndex: number;
  phase: "info" | "answering" | "completed";
}

/**
 * Generate storage key for a specific assignment.
 *
 * Scoped by userId so a leftover in-progress session from a previously
 * logged-in student (e.g. a shared computer where the next student signs in
 * without explicitly signing out) is never picked up by another account.
 * `userId` is omitted only for the unauthenticated public-link flow, which
 * has no accounts to collide across.
 */
function getStorageKey(assignmentId: string, userId?: string): string {
  return `assignment_session_${assignmentId}_${userId ?? "anon"}`;
}

/**
 * Save session data to localStorage
 */
export function saveSession(
  assignmentId: string,
  session: AssignmentSession,
  userId?: string
): void {
  try {
    const key = getStorageKey(assignmentId, userId);
    localStorage.setItem(key, JSON.stringify(session));
  } catch (error) {
    console.error("Error saving session to localStorage:", error);
  }
}

/**
 * Load session data from localStorage
 */
export function loadSession(
  assignmentId: string,
  userId?: string
): AssignmentSession | null {
  try {
    const key = getStorageKey(assignmentId, userId);
    const data = localStorage.getItem(key);
    if (!data) return null;
    return JSON.parse(data) as AssignmentSession;
  } catch (error) {
    console.error("Error loading session from localStorage:", error);
    return null;
  }
}

/**
 * Update only the current question index in the session
 */
export function updateQuestionIndex(
  assignmentId: string,
  questionIndex: number,
  userId?: string
): void {
  const session = loadSession(assignmentId, userId);
  if (session) {
    saveSession(
      assignmentId,
      {
        ...session,
        currentQuestionIndex: questionIndex,
      },
      userId
    );
  }
}

/**
 * Clear session data from localStorage
 */
export function clearSession(assignmentId: string, userId?: string): void {
  try {
    const key = getStorageKey(assignmentId, userId);
    localStorage.removeItem(key);
  } catch (error) {
    console.error("Error clearing session from localStorage:", error);
  }
}

/**
 * Get submission ID from URL search parameters
 */
export function getSubmissionIdFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  return params.get("sid");
}

/**
 * Update URL with submission ID without reloading the page
 */
export function updateUrlWithSubmissionId(
  assignmentId: string,
  submissionId: string
): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set("sid", submissionId);
  window.history.replaceState({}, "", url.toString());
}

/**
 * Remove submission ID from URL without reloading the page
 */
export function removeSubmissionIdFromUrl(): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.delete("sid");
  window.history.replaceState({}, "", url.toString());
}

