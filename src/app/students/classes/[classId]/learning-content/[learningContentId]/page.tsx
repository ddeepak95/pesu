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
import { getContentItemByRefId } from "@/lib/queries/contentItems";
import { isContentComplete } from "@/lib/queries/contentCompletions";
import MarkAsCompleteButton from "@/components/Student/MarkAsCompleteButton";

function LearningContentPageContent() {
  const params = useParams();
  const classId = params.classId as string;
  const learningContentId = params.learningContentId as string;

  const [content, setContent] = useState<LearningContent | null>(null);
  const [contentItemId, setContentItemId] = useState<string | null>(null);
  const [isComplete, setIsComplete] = useState(false);
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

      // Fetch content item ID for completion tracking
      const contentItem = await getContentItemByRefId(data.id, "learning_content");
      if (contentItem) {
        setContentItemId(contentItem.id);
        // Check if already complete
        const complete = await isContentComplete(contentItem.id);
        setIsComplete(complete);
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
                  <YouTubeEmbed videoUrl={content.video_url} title={content.title} />
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

  return (
    <ActivityTrackingProvider userId={user?.id} classId={classId}>
      <LearningContentPageContent />
    </ActivityTrackingProvider>
  );
}
