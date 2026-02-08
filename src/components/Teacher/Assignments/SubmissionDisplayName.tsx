"use client";

import {
  StudentSubmissionStatus,
  PublicSubmissionStatus,
} from "@/lib/queries/submissions";
import { getStudentDisplayName } from "@/lib/utils/displayName";

interface SubmissionDisplayNameProps {
  submission: StudentSubmissionStatus | PublicSubmissionStatus;
}

export function SubmissionDisplayName({ submission }: SubmissionDisplayNameProps) {
  if ('student' in submission) {
    return <>{getStudentDisplayName(submission.student)}</>;
  } else {
    const sub = submission.submission;
    if (sub.responder_details) {
      return (
        <>
          {sub.responder_details.name ||
            sub.responder_details.email ||
            sub.submission_id.substring(0, 8) + "..."}
        </>
      );
    }
    return <>{sub.submission_id.substring(0, 8) + "..."}</>;
  }
}
