"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import PageLayout from "@/components/PageLayout";
import BackButton from "@/components/ui/back-button";
import { getLearningContentByShortId } from "@/lib/queries/learningContent";
import { LearningContent } from "@/types/learningContent";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import YouTubeEmbed from "@/components/Shared/YouTubeEmbed";
import { useActivityTracking } from "@/hooks/useActivityTracking";
import { useAuth } from "@/contexts/AuthContext";
import { ActivityTrackingProvider } from "@/contexts/ActivityTrackingContext";
import {
  getContentItemByRefId,
  getContentItemsByGroup,
} from "@/lib/queries/contentItems";
import {
  isContentComplete,
  getCompletionsForStudent,
} from "@/lib/queries/contentCompletions";
import MarkAsCompleteButton from "@/components/Student/MarkAsCompleteButton";
import { getClassByClassId } from "@/lib/queries/classes";
import { getStudentGroupForClass } from "@/lib/queries/groups";
import { getUnlockState } from "@/lib/utils/unlockLogic";
import { ContentItem } from "@/types/contentItem";

function LearningContentPageContent({
  onClassUuid,
}: {
  onClassUuid?: (id: string) => void;
}) {
  const params = useParams();
  const classId = params.classId as string;
  const learningContentId = params.learningContentId as string;
  const { user } = useAuth();

  const [content, setContent] = useState<LearningContent | null>(null);
  const [contentItemId, setContentItemId] = useState<string | null>(null);
  const [contentItem, setContentItem] = useState<ContentItem | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const [isContentLocked, setIsContentLocked] = useState<boolean>(false);
  const [lockReason, setLockReason] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Activity tracking for learning content viewing time
  // Uses ActivityTrackingContext for userId and classId
  useActivityTracking({
    componentType: "learning_content",
    componentId: learningContentId,
    enabled: !loading && !!content, // Only track when content is loaded
  });

  const fetchContent = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getLearningContentByShortId(learningContentId);
      if (!data) {
        setError("Learning content not found");
        return;
      }
      setContent(data);

      // Fetch content item for completion tracking and unlock checking
      const fetchedContentItem = await getContentItemByRefId(
        data.id,
        "learning_content"
      );
      if (fetchedContentItem) {
        setContentItemId(fetchedContentItem.id);
        setContentItem(fetchedContentItem);

        // Check if already complete
        const complete = await isContentComplete(fetchedContentItem.id);
        setIsComplete(complete);

        // Check unlock status if user is authenticated
        if (user) {
          try {
            // Get class data to check progressive unlock setting
            const classData = await getClassByClassId(classId);
            if (classData?.id) {
              onClassUuid?.(classData.id);
            }
            if (classData?.enable_progressive_unlock) {
              // Get student's group
              const groupId = await getStudentGroupForClass(
                classData.id,
                user.id
              );

              // Skip unlock check if student is not assigned to a group
              if (!groupId) {
                return;
              }

              // Get all content items in the group
              const allContentItems = await getContentItemsByGroup({
                classDbId: classData.id,
                classGroupId: groupId,
              });

              // Get completions
              const contentItemIds = allContentItems.map((item) => item.id);
              const completedIds = await getCompletionsForStudent(
                contentItemIds
              );

              // Calculate unlock state for this specific content item
              const unlockState = getUnlockState(
                fetchedContentItem.id,
                allContentItems,
                completedIds,
                true
              );

              if (unlockState && unlockState.isLocked) {
                setIsContentLocked(true);
                setLockReason(unlockState.lockReason);
              }
            }
          } catch (unlockErr) {
            console.error("Error checking unlock status:", unlockErr);
            // Don't block access if there's an error checking unlock status
          }
        }
      }
    } catch (err) {
      console.error("Error fetching learning content:", err);
      setError("Failed to load learning content");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (learningContentId) fetchContent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [learningContentId]);

  if (loading) {
    return (
      <PageLayout>
        <div className="p-8 text-center">
          <p className="text-muted-foreground">Loading learning content…</p>
        </div>
      </PageLayout>
    );
  }

  if (error || !content) {
    return (
      <PageLayout>
        <div className="p-8 text-center">
          <p className="text-destructive">{error || "Not found"}</p>
        </div>
      </PageLayout>
    );
  }

  if (isContentLocked) {
    return (
      <PageLayout>
        <div className="p-8">
          <div className="mb-4">
            <BackButton href={`/students/classes/${classId}`} />
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
            <p className="text-muted-foreground mb-4">{lockReason}</p>
            <BackButton href={`/students/classes/${classId}`} />
          </div>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <div className="border-b">
        <div className="p-8 pb-0">
          <div className="mb-4">
            <BackButton href={`/students/classes/${classId}`} />
          </div>
          <div className="mb-6">
            <h1 className="text-3xl font-bold">{content.title}</h1>
            <div className="flex items-center gap-4 mt-1 text-muted-foreground">
              <p className="capitalize">Type: {content.content_type}</p>
            </div>
          </div>

          <div className="space-y-6 pb-8">
            {content.video_url && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Video</CardTitle>
                </CardHeader>
                <CardContent>
                  <YouTubeEmbed
                    videoUrl={content.video_url}
                    title={content.title}
                  />
                </CardContent>
              </Card>
            )}

            {content.body && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Text</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="whitespace-pre-wrap">{content.body}</div>
                </CardContent>
              </Card>
            )}

            {/* Mark as Complete Button */}
            {contentItemId && (
              <div className="flex justify-center pt-4">
                <MarkAsCompleteButton
                  contentItemId={contentItemId}
                  isComplete={isComplete}
                  onComplete={() => setIsComplete(true)}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </PageLayout>
  );
}

export default function StudentLearningContentPage() {
  const params = useParams();
  const classId = params.classId as string;
  const { user } = useAuth();
  const [classUuid, setClassUuid] = useState<string | null>(null);

  return (
    <ActivityTrackingProvider userId={user?.id} classId={classUuid ?? classId}>
      <LearningContentPageContent onClassUuid={setClassUuid} />
    </ActivityTrackingProvider>
  );
}
