"use client";

import {
  StudentSubmissionStatus,
  PublicSubmissionStatus,
} from "@/lib/queries/submissions";

interface SubmissionDisplayNameProps {
  submission: StudentSubmissionStatus | PublicSubmissionStatus;
}

export function SubmissionDisplayName({ submission }: SubmissionDisplayNameProps) {
  if ('student' in submission) {
    // Student submission
    const student = submission.student;
    return (
      <>
        {student.student_display_name ||
          student.student_email ||
          student.student_id.substring(0, 8) + "..."}
      </>
    );
  } else {
    // Public submission
    const sub = submission.submission;
    if (sub.responder_details) {
      return (
        <>
          {sub.responder_details.name ||
            sub.responder_details.email ||
            sub.student_name ||
            sub.submission_id.substring(0, 8) + "..."}
        </>
      );
    }
    return <>{sub.student_name || sub.submission_id.substring(0, 8) + "..."}</>;
  }
}
