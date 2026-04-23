"use client";

import { useEffect, useRef } from "react";
import { ComponentType } from "@/types/activity";
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
}

/**
 * Emit lifecycle events as the user leaves/returns to a component.
 *
 * Events:
 *   - `component_closed` on `pagehide` and React unmount (once per mount).
 *   - `component_backgrounded` when visibility becomes `hidden`.
 *   - `component_foregrounded` when visibility returns to `visible`.
 *
 * This intentionally treats tab-switch/background as non-close transitions.
 */
export function useComponentCloseTracking({
  componentType,
  componentId,
  subComponentId,
  enabled = true,
  userId,
  classId,
  submissionId,
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
  });
  dataRef.current = {
    componentType,
    componentId,
    subComponentId,
    classId: classId ?? context.classId,
    submissionId: submissionId ?? context.submissionId,
    userId: userId ?? context.userId,
  };

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;

    let closeEmitted = false;
    let isHidden = document.visibilityState === "hidden";

    const emitLifecycleEvent = (
      eventType:
        | "component_closed"
        | "component_backgrounded"
        | "component_foregrounded"
    ) => {
      const d = dataRef.current;
      void emitActivityEvent({
        eventType,
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
      emitLifecycleEvent("component_closed");
    };

    const onPageHide = () => emitClose();
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        if (!isHidden) {
          isHidden = true;
          emitLifecycleEvent("component_backgrounded");
        }
        return;
      }

      if (isHidden) {
        isHidden = false;
        emitLifecycleEvent("component_foregrounded");
      }
    };

    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      // Route-change / in-app unmount path.
      emitClose();
    };
  }, [enabled]);
}
