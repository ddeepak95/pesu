import type { ContentItemType } from "@/types/contentCompletion";

function submissionTabForContentType(type: ContentItemType): string {
  switch (type) {
    case "formative_assignment":
      return "submissions";
    case "quiz":
      return "submissions";
    case "survey":
      return "responses";
    case "learning_content":
      return "completions";
    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}

function materialPathSegment(type: ContentItemType): string {
  switch (type) {
    case "formative_assignment":
      return "assignments";
    case "quiz":
      return "quizzes";
    case "survey":
      return "surveys";
    case "learning_content":
      return "learning-content";
    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}

export interface TeacherStudentSubmissionLinkParams {
  classRouteId: string;
  contentType: ContentItemType;
  routeEntityId: string;
  placementGroupId: string | null;
  studentId: string;
}

/**
 * Teacher route to the material's roster/submissions tab with group context and
 * optional deep-open via `studentId` (consumed by tab components).
 */
export function buildTeacherStudentSubmissionHref(
  params: TeacherStudentSubmissionLinkParams
): string {
  const { classRouteId, contentType, routeEntityId, placementGroupId, studentId } =
    params;
  if (!routeEntityId.trim()) return "";

  const segment = materialPathSegment(contentType);
  const path = `/teacher/classes/${classRouteId}/${segment}/${routeEntityId}`;
  const qs = new URLSearchParams();
  qs.set("tab", submissionTabForContentType(contentType));
  if (placementGroupId) {
    qs.set("groupId", placementGroupId);
  }
  qs.set("studentId", studentId);
  return `${path}?${qs.toString()}`;
}
