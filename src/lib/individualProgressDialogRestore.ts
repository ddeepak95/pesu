const STORAGE_KEY_PREFIX = "asr-restore-individual-progress:";
/** Ignore stale entries if the teacher took a long path back to the class. */
const MAX_AGE_MS = 15 * 60 * 1000;

export function rememberIndividualProgressReturn(
  classDbId: string,
  studentId: string
): void {
  try {
    sessionStorage.setItem(
      STORAGE_KEY_PREFIX + classDbId,
      JSON.stringify({ studentId, t: Date.now() })
    );
  } catch {
    /* quota / private mode */
  }
}

/** Read pending restore without removing (safe under React Strict Mode remounts). */
export function readIndividualProgressRestore(
  classDbId: string
): string | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY_PREFIX + classDbId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { studentId?: string; t?: number };
    if (
      typeof parsed.studentId !== "string" ||
      typeof parsed.t !== "number"
    ) {
      return null;
    }
    if (Date.now() - parsed.t > MAX_AGE_MS) return null;
    return parsed.studentId;
  } catch {
    return null;
  }
}

export function clearIndividualProgressRestore(classDbId: string): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY_PREFIX + classDbId);
  } catch {
    /* ignore */
  }
}
