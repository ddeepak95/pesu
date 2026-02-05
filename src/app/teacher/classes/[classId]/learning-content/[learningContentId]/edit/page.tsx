"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import PageLayout from "@/components/PageLayout";
import BackButton from "@/components/ui/back-button";
import { useAuth } from "@/contexts/AuthContext";
import {
  getLearningContentByShortIdForTeacher,
  updateLearningContent,
} from "@/lib/queries/learningContent";
import { updateContentItemStatusByRef } from "@/lib/queries/contentItems";
import LearningContentForm from "@/components/Teacher/LearningContent/LearningContentForm";
import { LearningContent } from "@/types/learningContent";

export default function EditLearningContentPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();

  const classId = params.classId as string;
  const learningContentId = params.learningContentId as string;

  const [content, setContent] = useState<LearningContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getLearningContentByShortIdForTeacher(
          learningContentId
        );
        if (!data) setError("Learning content not found");
        else setContent(data);
      } catch (err) {
        console.error("Error fetching learning content:", err);
        setError("Failed to load learning content");
      } finally {
        setLoading(false);
      }
    };

    if (learningContentId) fetch();
  }, [learningContentId]);

  if (loading) {
    return (
      <PageLayout>
        <div className="text-center">
          <p className="text-muted-foreground">Loading…</p>
        </div>
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
        <h1 className="text-3xl font-bold mb-2">Edit Learning Content</h1>
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

            router.push(
              `/teacher/classes/${classId}/learning-content/${learningContentId}${
                searchParams.toString() ? `?${searchParams.toString()}` : ""
              }`
            );
          }}
        />
      </div>
    </PageLayout>
  );
}
