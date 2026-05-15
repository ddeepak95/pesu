"use client";

import { useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import PageLayout from "@/components/PageLayout";
import AiConfigMisconfigBanner from "@/components/Settings/AiConfig/AiConfigMisconfigBanner";
import Content from "@/components/Student/Classes/Content";
import ProfileDetailsDialog from "@/components/Student/Classes/ProfileDetailsDialog";
import { Button } from "@/components/ui/button";
import { Class } from "@/types/class";
import { useStudentProfile } from "@/hooks/useStudentProfile";
import { Settings } from "lucide-react";
import { useComponentCloseTracking } from "@/hooks/useComponentCloseTracking";
import { emitActivityEvent } from "@/lib/activity/emitter";

interface ClassDetailClientProps {
  classData: Class;
  userId: string;
  classId: string;
}

export default function ClassDetailClient({
  classData,
  userId,
  classId,
}: ClassDetailClientProps) {
  const classClosedEmittedRef = useRef(false);

  const emitClassClosed = useCallback(
    (subComponentId: string) => {
      if (classClosedEmittedRef.current) return;
      classClosedEmittedRef.current = true;
      void emitActivityEvent({
        eventType: "class_closed",
        componentType: "class",
        componentId: classData.class_id,
        userId,
        classId: classData.id,
        subComponentId,
        interactionSource: "click",
      });
    },
    [classData.class_id, classData.id, userId]
  );

  useComponentCloseTracking({
    componentType: "class",
    componentId: classData.class_id,
    userId,
    classId: classData.id,
    closeEventType: "class_closed",
    // Opening class content items unmounts this page, but that's still inside
    // class context. We only emit class_closed on explicit class exit + pagehide.
    emitOnUnmount: false,
  });

  // Browser back/forward should count as class exit when we leave this class route.
  useEffect(() => {
    const classPathPrefix = `/student/classes/${classId}`;
    const onPopState = () => {
      const nextPath = window.location.pathname;
      if (!nextPath.startsWith(classPathPrefix)) {
        emitClassClosed("browser_back_or_forward");
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [classId, emitClassClosed]);

  // Use the profile hook to fetch fields and check completion
  const {
    fields: profileFields,
    responses: existingResponses,
    hasCompletedRequired,
    loading: profileLoading,
    refetch,
  } = useStudentProfile(classData.id, userId);

  // Show profile dialog when there are required fields and they are not yet completed (derived, no effect)
  const showProfileDialog =
    !profileLoading && profileFields.length > 0 && !hasCompletedRequired;

  // Restore scroll position when navigating back from a content page
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(`scroll_${classId}`);
      if (raw != null) {
        const y = Number(raw);
        sessionStorage.removeItem(`scroll_${classId}`);
        requestAnimationFrame(() => {
          setTimeout(() => window.scrollTo(0, y), 50);
        });
      }
    } catch {}
  }, [classId]);

  const handleProfileComplete = () => {
    refetch();
  };

  return (
    <PageLayout>
      {/* Profile details dialog - shows if student hasn't completed required fields */}
      {profileFields.length > 0 && (
        <ProfileDetailsDialog
          classDbId={classData.id}
          className={classData.name}
          studentId={userId}
          fields={profileFields}
          existingResponses={existingResponses}
          open={showProfileDialog}
          onComplete={handleProfileComplete}
        />
      )}

      <div>
        <div>
          <div className="mb-4">
            <Button variant="link" asChild className="p-0">
              <Link
                href="/student/classes"
                onClick={() => emitClassClosed("all_classes_link")}
              >
                &larr; All Classes
              </Link>
            </Button>
          </div>
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-3xl font-bold">{classData.name}</h1>
            <Button variant="outline" className="gap-2" asChild>
              <Link href={`/student/classes/${classId}/settings`}>
                <Settings className="h-4 w-4" />
                Settings
              </Link>
            </Button>
          </div>

          {classData.institution_id && (
            <div className="mb-6">
              <AiConfigMisconfigBanner
                classDbId={classData.id}
                institutionId={classData.institution_id}
              />
            </div>
          )}

          <Content classData={classData} />
        </div>
      </div>
    </PageLayout>
  );
}
