"use client";

import { useState } from "react";
import PageLayout from "@/components/PageLayout";
import CloseButton from "@/components/ui/close-button";
import GoToClassButton from "@/components/ui/go-to-class-button";
import NextItemButton from "@/components/ui/next-item-button";
import PageTitle from "@/components/Shared/PageTitle";
import { Pill } from "@/components/ui/pill";
import LearningContentViewer from "@/components/Shared/LearningContentViewer";
import { useAuth } from "@/contexts/AuthContext";
import {
  ActivityTrackingProvider,
  useActivityTrackingContext,
} from "@/contexts/ActivityTrackingContext";
import MarkAsCompleteButton from "@/components/Student/MarkAsCompleteButton";
import { LearningContent } from "@/types/learningContent";
import { useComponentCloseTracking } from "@/hooks/useComponentCloseTracking";
import { useNavigationTracking } from "@/hooks/useNavigationTracking";

interface LearningContentInnerProps {
  content: LearningContent;
  contentItemId: string | null;
  initialIsComplete: boolean;
  classId: string;
  classUuid: string | null;
}

function LearningContentInner({
  content,
  contentItemId,
  initialIsComplete,
  classId,
  classUuid,
}: LearningContentInnerProps) {
  const [isComplete, setIsComplete] = useState(initialIsComplete);
  const tracking = useActivityTrackingContext();

  useComponentCloseTracking({
    componentType: "learning_content",
    componentId: content.learning_content_id,
  });
  const { emitBack, emitClose, emitNextItem } = useNavigationTracking({
    componentType: "learning_content",
    componentId: content.learning_content_id,
  });

  return (
    <PageLayout>
      <div>
        <div>
          <div className="mb-4">
            <GoToClassButton classId={classId} onBeforeNavigate={emitBack} />
          </div>
          <div className="mb-6">
            <PageTitle
              title={content.title}
              badge={
                isComplete ? (
                  <Pill purpose="contentCompleted" className="w-fit">
                    Completed
                  </Pill>
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
                  componentType="learning_content"
                  componentId={content.learning_content_id}
                  isComplete={isComplete}
                  onComplete={() => setIsComplete(true)}
                  userId={tracking.userId}
                  classId={tracking.classId}
                />
              </div>
            )}

            {contentItemId && (
              <NextItemButton
                classDbId={classUuid}
                classId={classId}
                contentItemId={contentItemId}
                onBeforeNavigate={emitNextItem}
              />
            )}
            <CloseButton
              href={`/student/classes/${classId}`}
              onBeforeNavigate={emitClose}
            />
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
        classId={classId}
        classUuid={classUuid}
      />
    </ActivityTrackingProvider>
  );
}
