"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  StudentSubmissionNav,
  type SubmissionNavItem,
} from "@/components/Teacher/Assignments/StudentSubmissionNav";
import {
  submissionOverlayClasses,
} from "@/components/Teacher/Assignments/submissionOverlayTheme";
import { SubmissionReleaseStatusBadge } from "@/components/Teacher/Assignments/SubmissionReleaseStatusBadge";
import {
  SubmissionStatusBadge,
  type SubmissionLifecycleStatus,
} from "@/components/Teacher/Assignments/SubmissionStatusBadge";
import {
  useClassData,
  usePublicSubmissionsForAssignment,
  useSubmissionsForAssignment,
} from "@/hooks/swr";
import { getStudentDisplayName } from "@/lib/utils/displayName";

function getPublicLabel(
  submission: {
    submission_id: string;
    responder_details?: { name?: string | null; email?: string | null } | null;
  },
  index: number
): string {
  const details = submission.responder_details;
  return details?.name || details?.email || `Submission ${index + 1}`;
}

interface SubmissionOverlayHeaderProps {
  submissionId: string;
  assignmentId: string;
  classId: string;
  onNavigate: (submissionId: string) => void;
  onClose: () => void;
}

export function SubmissionOverlayHeader({
  submissionId,
  assignmentId,
  classId,
  onNavigate,
  onClose,
}: SubmissionOverlayHeaderProps) {
  const classQuery = useClassData(classId);
  const classDbId = classQuery.data?.id ?? null;
  const submissionsQuery = useSubmissionsForAssignment({ assignmentId, classId: classDbId });
  const publicSubmissionsQuery = usePublicSubmissionsForAssignment(assignmentId);

  const classSubmissions = useMemo(
    () => submissionsQuery.data ?? [],
    [submissionsQuery.data]
  );
  const publicSubmissions = useMemo(
    () => publicSubmissionsQuery.data ?? [],
    [publicSubmissionsQuery.data]
  );

  const currentIsPublic = useMemo(
    () => !classSubmissions.some((item) => item.submission?.submission_id === submissionId),
    [classSubmissions, submissionId]
  );

  const currentSubmissionInfo = useMemo<{
    status: SubmissionLifecycleStatus;
    submittedAt: string | null;
  }>(() => {
    const classMatch = classSubmissions.find(
      (item) => item.submission?.submission_id === submissionId
    );
    if (classMatch) {
      return {
        status: classMatch.status,
        submittedAt: classMatch.submission?.submitted_at ?? null,
      };
    }
    const publicMatch = publicSubmissions.find(
      (item) => item.submission?.submission_id === submissionId
    );
    return {
      status: publicMatch?.status ?? "started",
      submittedAt: publicMatch?.submission?.submitted_at ?? null,
    };
  }, [classSubmissions, publicSubmissions, submissionId]);

  const navigationItems = useMemo<SubmissionNavItem[]>(() => {
    if (currentIsPublic) {
      return publicSubmissions
        .filter((item) => item.submission !== null)
        .map((item, index) => ({
          submissionId: item.submission.submission_id,
          label: getPublicLabel(item.submission, index),
        }));
    }

    return [...classSubmissions]
      .filter((item) => item.submission !== null)
      .sort((a, b) =>
        getStudentDisplayName(a.student).localeCompare(getStudentDisplayName(b.student))
      )
      .map((item) => ({
        submissionId: item.submission!.submission_id,
        label: getStudentDisplayName(item.student),
      }));
  }, [currentIsPublic, classSubmissions, publicSubmissions]);

  return (
    <div className={submissionOverlayClasses.header}>
      <div className="flex items-center gap-4">
        <div className="w-72">
          <StudentSubmissionNav
            submissionId={submissionId}
            navigationItems={navigationItems}
            onNavigate={onNavigate}
            showClose={false}
          />
        </div>
        <SubmissionStatusBadge
          status={currentSubmissionInfo.status}
          submittedAt={currentSubmissionInfo.submittedAt}
          label="Submission Status:"
        />
        <SubmissionReleaseStatusBadge
          submissionId={submissionId}
          assignmentId={assignmentId}
          label="Grading Status:"
        />
      </div>
      <Button variant="secondary" onClick={onClose} className="px-8">
        Close
      </Button>
    </div>
  );
}
