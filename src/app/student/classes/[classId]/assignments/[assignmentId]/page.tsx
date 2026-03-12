import { verifySession, getContentUnlockState, buildContentItemUrl } from "@/lib/dal";
import { notFound } from "next/navigation";
import AssignmentDetailClient from "./AssignmentDetailClient";
import { ContentLockedView } from "@/components/Shared/ContentLockedView";

const ASSIGNMENT_ALL_COLUMNS = "*";

export default async function StudentAssignmentPage({
  params,
}: {
  params: Promise<{ classId: string; assignmentId: string }>;
}) {
  const { classId, assignmentId } = await params;
  const { user, supabase } = await verifySession("/student/login");

  const { data: assignmentData } = await supabase
    .from("assignments")
    .select(ASSIGNMENT_ALL_COLUMNS)
    .eq("assignment_id", assignmentId)
    .in("status", ["active", "draft"])
    .single();

  if (!assignmentData) notFound();

  // Check unlock state
  const unlockResult = await getContentUnlockState(
    supabase,
    user.id,
    classId,
    assignmentData.id,
    "formative_assignment"
  );

  if (unlockResult.isLocked) {
    let backHref = `/student/classes/${classId}`;
    let backLabel = "Go to class";
    const prev = unlockResult.previousItem;
    if (prev) {
      const url = await buildContentItemUrl(
        supabase,
        classId,
        prev.refId,
        prev.type
      );
      if (url) {
        backHref = url;
        backLabel = "Go to previous item";
      }
    }
    return (
      <ContentLockedView
        lockReason={unlockResult.lockReason!}
        classHref={`/student/classes/${classId}`}
        backHref={backHref}
        backLabel={backLabel}
        showBackButton={!unlockResult.isLockedAfterComplete}
      />
    );
  }

  return (
    <AssignmentDetailClient
      assignmentData={assignmentData}
      assignmentId={assignmentId}
      classId={classId}
      contentItemId={unlockResult.contentItemId}
      classUuid={unlockResult.classUuid}
    />
  );
}
