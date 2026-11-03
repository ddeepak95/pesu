"use client";
import { ContentLinkShare } from "@/components/Shared/ContentLinkShare";

export function AssignmentLinkShare({ assignmentId, classId, ...props }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignmentId: string;
  classId: string;
  isPublic: boolean;
}) {
  return <ContentLinkShare {...props} publicPath={`/assignment/${assignmentId}`} classroomPath={`/student/classes/${classId}/assignments/${assignmentId}`} />;
}
