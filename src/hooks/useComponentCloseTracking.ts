"use client";

import { useEffect, useRef } from "react";
import { ComponentType, EventType } from "@/types/activity";
import { useActivityTrackingContext } from "@/contexts/ActivityTrackingContext";
import { emitActivityEvent } from "@/lib/activity/emitter";

interface UseComponentCloseTrackingOptions {
  componentType: ComponentType;
  componentId: string;
  subComponentId?: string;
  /** Whether the listener is active (default: true). */
  enabled?: boolean;
  /** Override context values when the hook is used outside an
   *  `ActivityTrackingProvider` or when explicit identifiers are preferred. */
  userId?: string;
  classId?: string;
  submissionId?: string;
  /** Override the emitted close event type (default: component_closed). */
  closeEventType?: Extract<EventType, "component_closed" | "class_closed">;
  /** Emit close event from React unmount cleanup (default: true). */
  emitOnUnmount?: boolean;
}

/**
 * Emit a single `component_closed` event when the user leaves the component.
 *
 * Triggers (whichever fires first):
 *   - `pagehide`                      (tab close, refresh, cross-document nav)
 *   - React unmount                    (SPA route change within the app)
 */
export function useComponentCloseTracking({
  componentType,
  componentId,
  subComponentId,
  enabled = true,
  userId,
  classId,
  submissionId,
  closeEventType = "component_closed",
  emitOnUnmount = true,
}: UseComponentCloseTrackingOptions) {
  const context = useActivityTrackingContext();

  // Keep a ref of context + identity so effect cleanup always reads current values.
  const dataRef = useRef({
    componentType,
    componentId,
    subComponentId,
    classId: classId ?? context.classId,
    submissionId: submissionId ?? context.submissionId,
    userId: userId ?? context.userId,
    closeEventType,
  });

  useEffect(() => {
    dataRef.current = {
      componentType,
      componentId,
      subComponentId,
      classId: classId ?? context.classId,
      submissionId: submissionId ?? context.submissionId,
      userId: userId ?? context.userId,
      closeEventType,
    };
  }, [
    componentType,
    componentId,
    subComponentId,
    classId,
    submissionId,
    userId,
    context.classId,
    context.submissionId,
    context.userId,
    closeEventType,
  ]);

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;

    let closeEmitted = false;
    let mountCommitted = false;
    const mountCommitTimer = window.setTimeout(() => {
      mountCommitted = true;
    }, 0);

    const emitCloseEvent = () => {
      const d = dataRef.current;
      void emitActivityEvent({
        eventType: d.closeEventType,
        componentType: d.componentType,
        componentId: d.componentId,
        subComponentId: d.subComponentId,
        classId: d.classId,
        submissionId: d.submissionId,
        userId: d.userId,
      });
    };

    const emitClose = () => {
      if (closeEmitted) return;
      closeEmitted = true;
      emitCloseEvent();
    };

    const onPageHide = () => emitClose();

    window.addEventListener("pagehide", onPageHide);

    return () => {
      window.clearTimeout(mountCommitTimer);
      window.removeEventListener("pagehide", onPageHide);
      // React Strict Mode (dev) performs a mount->unmount->remount rehearsal.
      // Skip that synthetic unmount so we don't emit false `component_closed`.
      if (!mountCommitted) return;
      // Route-change / in-app unmount path.
      if (emitOnUnmount) emitClose();
    };
  }, [enabled, emitOnUnmount]);
}
