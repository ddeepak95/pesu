import { verifySession, getContentUnlockState, buildContentItemUrl } from "@/lib/dal";
import { notFound } from "next/navigation";
import LearningContentDetailClient from "./LearningContentDetailClient";
import { ContentLockedView } from "@/components/Shared/ContentLockedView";

const LC_ALL_COLUMNS =
  "id, learning_content_id, class_id, class_group_id, title, content_type, video_url, body, created_by, created_at, updated_at, status";

export default async function StudentLearningContentPage({
  params,
}: {
  params: Promise<{ classId: string; learningContentId: string }>;
}) {
  const { classId, learningContentId } = await params;
  const { user, supabase } = await verifySession("/student/login");

  const { data: contentData } = await supabase
    .from("learning_contents")
    .select(LC_ALL_COLUMNS)
    .eq("learning_content_id", learningContentId)
    .in("status", ["active", "draft"])
    .single();

  if (!contentData) notFound();

  // Check unlock state + completion
  const unlockResult = await getContentUnlockState(
    supabase,
    user.id,
    classId,
    contentData.id,
    "learning_content"
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
      />
    );
  }

  return (
    <LearningContentDetailClient
      content={contentData}
      contentItemId={unlockResult.contentItemId}
      isComplete={unlockResult.isComplete}
      classUuid={unlockResult.classUuid}
      classId={classId}
    />
  );
}
