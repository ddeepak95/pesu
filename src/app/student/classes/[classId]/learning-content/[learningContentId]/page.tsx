import { cache } from "react";
import { verifySession, getContentUnlockState, buildContentItemUrl } from "@/lib/dal";
import { notFound } from "next/navigation";
import LearningContentDetailClient from "./LearningContentDetailClient";
import { ContentLockedView } from "@/components/Shared/ContentLockedView";

const LC_ALL_COLUMNS =
  "id, learning_content_id, class_id, class_group_id, title, content_type, video_url, body, created_by, created_at, updated_at, status";

const getLearningContentData = cache(async (learningContentId: string) => {
  const { supabase } = await verifySession("/student/login");

  const { data } = await supabase
    .from("learning_contents")
    .select(LC_ALL_COLUMNS)
    .eq("learning_content_id", learningContentId)
    .in("status", ["active", "draft"])
    .single();

  return data;
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ learningContentId: string }>;
}) {
  const { learningContentId } = await params;
  const contentData = await getLearningContentData(learningContentId);
  return { title: contentData?.title ?? "Learning Content" };
}

export default async function StudentLearningContentPage({
  params,
}: {
  params: Promise<{ classId: string; learningContentId: string }>;
}) {
  const { classId, learningContentId } = await params;
  const { user, supabase } = await verifySession("/student/login");
  const contentData = await getLearningContentData(learningContentId);

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
        showBackButton={!unlockResult.isLockedAfterComplete}
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
