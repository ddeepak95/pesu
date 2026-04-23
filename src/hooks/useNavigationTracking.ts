"use client";

import { ComponentType } from "@/types/activity";
import { useActivityTrackingContext } from "@/contexts/ActivityTrackingContext";
import { emitActivityEvent } from "@/lib/activity/emitter";

interface UseNavigationTrackingOptions {
  componentType: ComponentType;
  componentId: string;
  userId?: string;
  classId?: string;
  submissionId?: string;
}

/**
 * Reusable navigation event emitters for page-level controls.
 */
export function useNavigationTracking({
  componentType,
  componentId,
  userId,
  classId,
  submissionId,
}: UseNavigationTrackingOptions) {
  const context = useActivityTrackingContext();

  const emit = (
    eventType:
      | "navigation_back_clicked"
      | "navigation_close_clicked"
      | "navigation_next_item_clicked",
    subComponentId?: string
  ) => {
    void emitActivityEvent({
      eventType,
      componentType,
      componentId,
      subComponentId,
      userId: userId ?? context.userId,
      classId: classId ?? context.classId,
      submissionId: submissionId ?? context.submissionId,
      interactionSource: "click",
    });
  };

  return {
    emitBack: (subComponentId = "go_to_class_button") =>
      emit("navigation_back_clicked", subComponentId),
    emitClose: (subComponentId = "close_button") =>
      emit("navigation_close_clicked", subComponentId),
    emitNextItem: (subComponentId = "next_item_button") =>
      emit("navigation_next_item_clicked", subComponentId),
  };
}

