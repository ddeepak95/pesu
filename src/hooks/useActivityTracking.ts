"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityTrackingOptions,
  ActivityTrackingReturn,
  ActivityLogInput,
  ActivityEventInput,
  EventType,
} from "@/types/activity";
import { useActivityTrackingContext } from "@/contexts/ActivityTrackingContext";

// Generate a stable session ID based on component identity and browser session
function generateSessionId(
  componentType: string,
  componentId: string,
  subComponentId?: string
): string {
  // Use sessionStorage to maintain a session identifier that persists across page navigation
  // but is unique per browser tab/session
  let browserSessionId = sessionStorage.getItem("activity_tracking_session");
  if (!browserSessionId) {
    browserSessionId = crypto.randomUUID();
    sessionStorage.setItem("activity_tracking_session", browserSessionId);
  }

  // Create a deterministic session ID based on component + browser session
  const key = `${browserSessionId}-${componentType}-${componentId}-${subComponentId || ""}`;
  return key;
}

// Default configuration
const DEFAULT_AUTO_SAVE_INTERVAL = 10000; // 10 seconds

/**
 * Simplified hook for tracking user activity time on components
 * - Periodic saves every N seconds (default 10s)
 * - Event logging for start/end timestamps
 * - No complex idle/hidden/unload tracking
 *
 * Uses ActivityTrackingContext for userId, classId, submissionId if not provided via options
 */
export function useActivityTracking(
  options: ActivityTrackingOptions
): ActivityTrackingReturn {
  // Get context values as fallback
  const context = useActivityTrackingContext();

  const {
    componentType,
    componentId,
    subComponentId,
    submissionId = context.submissionId,
    classId = context.classId,
    userId = context.userId,
    autoSaveInterval = DEFAULT_AUTO_SAVE_INTERVAL,
    autoStart = true,
    enabled = true,
  } = options;

  // State
  const [isTracking, setIsTracking] = useState(false);

  // Refs
  const sessionIdRef = useRef<string>("");
  const startTimeRef = useRef<number>(0);
  const hasInitializedRef = useRef(false); // Prevent double-init in React Strict Mode
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Calculate total time
  const getTotalTimeMs = useCallback(() => {
    if (!startTimeRef.current) return 0;
    return Date.now() - startTimeRef.current;
  }, []);

  // Save activity log to API (periodic time tracking)
  const saveActivityLog = useCallback(async () => {
    if (!startTimeRef.current || !sessionIdRef.current) return;

    const data: ActivityLogInput = {
      sessionId: sessionIdRef.current,
      userId,
      submissionId,
      classId,
      componentType,
      componentId,
      subComponentId,
      totalTimeMs: getTotalTimeMs(),
    };

    try {
      await fetch("/api/activity-logs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });
    } catch (error) {
      console.error("Failed to save activity log:", error);
    }
  }, [
    componentType,
    componentId,
    subComponentId,
    submissionId,
    classId,
    userId,
    getTotalTimeMs,
  ]);

  // Log an event (attempt_started or attempt_ended)
  const logEvent = useCallback(
    async (eventType: EventType) => {
      const data: ActivityEventInput = {
        userId,
        submissionId,
        classId,
        componentType,
        componentId,
        subComponentId,
        eventType,
      };

      try {
        await fetch("/api/activity-events", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(data),
        });
      } catch (error) {
        console.error("Failed to log activity event:", error);
      }
    },
    [componentType, componentId, subComponentId, submissionId, classId, userId]
  );

  // Start tracking
  const startTracking = useCallback(() => {
    // Prevent double-initialization (React Strict Mode)
    if (isTracking || !enabled || hasInitializedRef.current) return;

    hasInitializedRef.current = true;
    sessionIdRef.current = generateSessionId(
      componentType,
      componentId,
      subComponentId
    );
    startTimeRef.current = Date.now();
    setIsTracking(true);
  }, [isTracking, enabled, componentType, componentId, subComponentId]);

  // Stop tracking
  const stopTracking = useCallback(() => {
    if (!isTracking) return;

    // Clear interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // Final save
    saveActivityLog();

    // Reset
    hasInitializedRef.current = false;
    setIsTracking(false);
  }, [isTracking, saveActivityLog]);

  // Periodic save interval
  useEffect(() => {
    if (!isTracking || !enabled) return;

    // Initial save
    saveActivityLog();

    // Set up periodic saves
    intervalRef.current = setInterval(() => {
      saveActivityLog();
    }, autoSaveInterval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isTracking, enabled, autoSaveInterval, saveActivityLog]);

  // Auto-start tracking on mount
  useEffect(() => {
    if (autoStart && enabled && !isTracking && !hasInitializedRef.current) {
      startTracking();
    }
  }, [autoStart, enabled, isTracking, startTracking]);

  // Cleanup on unmount - just clear interval, no complex save logic
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return {
    isTracking,
    totalTimeMs: getTotalTimeMs(),
    startTracking,
    stopTracking,
    logEvent,
  };
}
