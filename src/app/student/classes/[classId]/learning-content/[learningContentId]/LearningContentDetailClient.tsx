"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import PageLayout from "@/components/PageLayout";
import BackButton from "@/components/ui/back-button";
import PageTitle from "@/components/Shared/PageTitle";
import LearningContentViewer from "@/components/Shared/LearningContentViewer";
import { useActivityTracking } from "@/hooks/useActivityTracking";
import { useAuth } from "@/contexts/AuthContext";
import { ActivityTrackingProvider } from "@/contexts/ActivityTrackingContext";
import { Button } from "@/components/ui/button";
import MarkAsCompleteButton from "@/components/Student/MarkAsCompleteButton";
import { LearningContent } from "@/types/learningContent";

interface LearningContentInnerProps {
  content: LearningContent;
  contentItemId: string | null;
  initialIsComplete: boolean;
}

function LearningContentInner({
  content,
  contentItemId,
  initialIsComplete,
}: LearningContentInnerProps) {
  const router = useRouter();
  const [isComplete, setIsComplete] = useState(initialIsComplete);

  // Activity tracking for learning content viewing time
  useActivityTracking({
    componentType: "learning_content",
    componentId: content.learning_content_id,
    enabled: true,
  });

  return (
    <PageLayout>
      <div>
        <div>
          <div className="mb-4">
            <BackButton />
          </div>
          <div className="mb-6">
            <PageTitle
              title={content.title}
              badge={
                isComplete ? (
                  <span className="text-xs rounded-full border border-green-500/30 bg-green-500/10 px-2 py-0.5 text-green-600 dark:text-green-400 w-fit">
                    Completed
                  </span>
                ) : null
              }
            />
          </div>

          <div className="space-y-6 pb-8">
            <LearningContentViewer
              title={content.title}
              body={content.body}
              videoUrl={content.video_url}
            />

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

            {/* Close button to go back */}
            <div className="flex justify-center pt-2">
              <Button
                variant="outline"
                size="lg"
                onClick={() => router.back()}
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}

interface LearningContentDetailClientProps {
  content: LearningContent;
  contentItemId: string | null;
  isComplete: boolean;
  classUuid: string | null;
  classId: string;
}

export default function LearningContentDetailClient({
  content,
  contentItemId,
  isComplete,
  classUuid,
  classId,
}: LearningContentDetailClientProps) {
  const { user } = useAuth();

  return (
    <ActivityTrackingProvider userId={user?.id} classId={classUuid ?? classId}>
      <LearningContentInner
        content={content}
        contentItemId={contentItemId}
        initialIsComplete={isComplete}
      />
    </ActivityTrackingProvider>
  );
}
