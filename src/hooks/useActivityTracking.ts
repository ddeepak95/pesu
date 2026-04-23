"use client";

import { useCallback, useRef } from "react";
import {
  ActivityTrackingOptions,
  ActivityTrackingReturn,
  EventType,
} from "@/types/activity";
import { useActivityTrackingContext } from "@/contexts/ActivityTrackingContext";
import { emitActivityEvent } from "@/lib/activity/emitter";

/**
 * Hook for emitting semantic activity events.
 *
 * Periodic time tracking (`activity_logs`) has been removed in favor of an
 * event-only model. Durations are derived downstream from ordered event
 * timestamps on `activity_events`.
 *
 * Falls back to `ActivityTrackingContext` for userId / classId / submissionId
 * when options don't provide them.
 */
export function useActivityTracking(
  options: ActivityTrackingOptions
): ActivityTrackingReturn {
  const context = useActivityTrackingContext();

  const {
    componentType,
    componentId,
    subComponentId,
    submissionId = context.submissionId,
    classId = context.classId,
    userId = context.userId,
  } = options;

  // Capture current identifiers in a ref so `logEvent` stays referentially
  // stable but always reads the latest values.
  const identityRef = useRef({
    componentType,
    componentId,
    subComponentId,
    submissionId,
    classId,
    userId,
  });
  identityRef.current = {
    componentType,
    componentId,
    subComponentId,
    submissionId,
    classId,
    userId,
  };

  const logEvent = useCallback(async (eventType: EventType) => {
    const id = identityRef.current;
    await emitActivityEvent({
      eventType,
      componentType: id.componentType,
      componentId: id.componentId,
      subComponentId: id.subComponentId,
      submissionId: id.submissionId,
      classId: id.classId,
      userId: id.userId,
    });
  }, []);

  return { logEvent };
}
