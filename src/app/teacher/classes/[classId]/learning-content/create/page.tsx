"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import PageLayout from "@/components/PageLayout";
import BackButton from "@/components/ui/back-button";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { getClassByClassId } from "@/lib/queries/classes";
import { createLearningContent } from "@/lib/queries/learningContent";
import { createContentItem } from "@/lib/queries/contentItems";
import LearningContentForm from "@/components/Teacher/LearningContent/LearningContentForm";
import { getClassGroups } from "@/lib/queries/groups";

export default function CreateLearningContentPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();

  const classId = params.classId as string;
  const [classDbId, setClassDbId] = useState<string | null>(null);
  const [classGroupId, setClassGroupId] = useState<string | null>(null);
  const [loadingClass, setLoadingClass] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const backToContentHref = useMemo(() => {
    const groupId = searchParams.get("groupId");
    return groupId
      ? `/teacher/classes/${classId}?tab=content&groupId=${groupId}`
      : `/teacher/classes/${classId}?tab=content`;
  }, [classId, searchParams]);

  useEffect(() => {
    const fetchClass = async () => {
      try {
        const classData = await getClassByClassId(classId);
        if (!classData) {
          setError("Class not found");
          return;
        }
        setClassDbId(classData.id);
      } catch (err) {
        console.error("Error fetching class:", err);
        setError("Failed to load class");
      } finally {
        setLoadingClass(false);
      }
    };

    if (classId) fetchClass();
  }, [classId]);

  useEffect(() => {
    const initGroup = async () => {
      if (!classDbId) return;
      const fromUrl = searchParams.get("groupId");
      if (fromUrl) {
        setClassGroupId(fromUrl);
        return;
      }
      try {
        const groups = await getClassGroups(classDbId);
        setClassGroupId(groups[0]?.id ?? null);
      } catch (err) {
        console.error("Error loading class groups:", err);
        setClassGroupId(null);
      }
    };
    initGroup();
  }, [classDbId, searchParams]);

  if (loadingClass) {
    return (
      <PageLayout>
        <div className="text-center">
          <p className="text-muted-foreground">Loading…</p>
        </div>
      </PageLayout>
    );
  }

  if (error || !classDbId || !classGroupId) {
    return (
      <PageLayout>
        <div className="text-center">
          <p className="text-destructive">
            {error || "Class/groups not found"}
          </p>
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
        <h1 className="text-3xl font-bold mb-2">Create Learning Content</h1>
        <p className="text-muted-foreground mb-8">
          Add a video link, text notes, or both.
        </p>

        <LearningContentForm
          submitLabel="Create"
          onSubmit={async ({ title, videoUrl, body, isDraft }) => {
            if (!user) throw new Error("You must be logged in");

            const learningContent = await createLearningContent(
              {
                class_id: classDbId,
                class_group_id: classGroupId,
                title,
                video_url: videoUrl || null,
                body: body || null,
                status: isDraft ? "draft" : "active",
              },
              user.id
            );

            await createContentItem(
              {
                class_id: classDbId,
                class_group_id: classGroupId,
                type: "learning_content",
                ref_id: learningContent.id,
                status: isDraft ? "draft" : "active",
              },
              user.id
            );

            router.push(
              `/teacher/classes/${classId}/learning-content/${learningContent.learning_content_id}`
            );
          }}
        />
        <div className="mt-6">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push(backToContentHref)}
          >
            Cancel
          </Button>
        </div>
      </div>
    </PageLayout>
  );
}
