"use client";

import { useParams, useRouter } from "next/navigation";
import PageLayout from "@/components/PageLayout";
import BackButton from "@/components/ui/back-button";
import { Button } from "@/components/ui/button";
import PageTitle from "@/components/Shared/PageTitle";
import { useAuth } from "@/contexts/AuthContext";
import { updateLearningContent } from "@/lib/queries/learningContent";
import { updateContentItemStatusByRef } from "@/lib/queries/contentItems";
import LearningContentForm from "@/components/Teacher/LearningContent/LearningContentForm";
import { showSuccessToast } from "@/lib/toast";
import { useLearningContentByShortIdForTeacher } from "@/hooks/swr";

export default function EditLearningContentPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();

  const learningContentId = params.learningContentId as string;

  const contentQuery = useLearningContentByShortIdForTeacher(learningContentId);
  const content = contentQuery.data ?? null;
  const loading = contentQuery.isLoading;
  const error = contentQuery.error
    ? "Failed to load learning content"
    : !loading && !content
      ? "Learning content not found"
      : null;

  if (loading) {
    return (
      <PageLayout>
        <div />
      </PageLayout>
    );
  }

  if (error || !content) {
    return (
      <PageLayout>
        <div className="text-center">
          <p className="text-destructive">{error || "Not found"}</p>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <div>
        <div className="mb-4">
          <BackButton />
        </div>
        <PageTitle title="Edit Learning Content" className="mb-2" />
        <p className="text-muted-foreground mb-8">
          Update the title, link, text, and draft status.
        </p>

        <LearningContentForm
          submitLabel="Save changes"
          initialTitle={content.title}
          initialVideoUrl={content.video_url ?? ""}
          initialBody={content.body ?? ""}
          initialIsDraft={content.status === "draft"}
          onSubmit={async ({ title, videoUrl, body, isDraft }) => {
            if (!user) throw new Error("You must be logged in");

            const updated = await updateLearningContent(content.id, {
              title,
              video_url: videoUrl || null,
              body: body || null,
              status: isDraft ? "draft" : "active",
            });

            await updateContentItemStatusByRef({
              class_id: content.class_id,
              type: "learning_content",
              ref_id: content.id,
              status: updated.status,
            });

            showSuccessToast("Learning content updated successfully");
          }}
        />

        <div className="mt-6 flex justify-center">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
          >
            Close
          </Button>
        </div>
      </div>
    </PageLayout>
  );
}
