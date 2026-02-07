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
 * Generate storage key for a specific assignment
 */
function getStorageKey(assignmentId: string): string {
  return `assignment_session_${assignmentId}`;
}

/**
 * Save session data to localStorage
 */
export function saveSession(
  assignmentId: string,
  session: AssignmentSession
): void {
  try {
    const key = getStorageKey(assignmentId);
    localStorage.setItem(key, JSON.stringify(session));
  } catch (error) {
    console.error("Error saving session to localStorage:", error);
  }
}

/**
 * Load session data from localStorage
 */
export function loadSession(
  assignmentId: string
): AssignmentSession | null {
  try {
    const key = getStorageKey(assignmentId);
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
  questionIndex: number
): void {
  const session = loadSession(assignmentId);
  if (session) {
    saveSession(assignmentId, {
      ...session,
      currentQuestionIndex: questionIndex,
    });
  }
}

/**
 * Clear session data from localStorage
 */
export function clearSession(assignmentId: string): void {
  try {
    const key = getStorageKey(assignmentId);
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

