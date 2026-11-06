/** Keep a saved submission available for retry if the separate completion write fails. */
export async function submitAndComplete<T>({
  existingSubmission,
  createSubmission,
  onSubmissionSaved,
  markComplete,
}: {
  existingSubmission: T | null;
  createSubmission: () => Promise<T>;
  onSubmissionSaved: (submission: T) => void;
  markComplete: () => Promise<unknown>;
}): Promise<void> {
  const submission = existingSubmission ?? await createSubmission();
  onSubmissionSaved(submission);
  await markComplete();
}
