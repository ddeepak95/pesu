import { verifySession, getContentUnlockState } from "@/lib/dal";
import { notFound } from "next/navigation";
import LearningContentDetailClient from "./LearningContentDetailClient";
import PageLayout from "@/components/PageLayout";
import BackButton from "@/components/ui/back-button";

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
    return (
      <PageLayout>
        <div>
          <div className="mb-4">
            <BackButton />
          </div>
          <div className="text-center py-12">
            <div className="inline-block p-4 rounded-full bg-muted mb-4">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-12 w-12 text-muted-foreground"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
            </div>
            <h2 className="text-2xl font-bold mb-2">Content Locked</h2>
            <p className="text-muted-foreground mb-4">
              {unlockResult.lockReason}
            </p>
            <BackButton />
          </div>
        </div>
      </PageLayout>
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
