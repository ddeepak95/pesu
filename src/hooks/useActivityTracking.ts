"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useIdleTimer } from "react-idle-timer";
import {
  ActivityTrackingOptions,
  ActivityTrackingReturn,
  ActivityLogInput,
} from "@/types/activity";
import { useActivityTrackingContext } from "@/contexts/ActivityTrackingContext";

// Generate a unique session ID
function generateSessionId(): string {
  return crypto.randomUUID();
}

// Default configuration
const DEFAULT_IDLE_TIMEOUT = 30000; // 30 seconds
const DEFAULT_AUTO_SAVE_INTERVAL = 60000; // 60 seconds

/**
 * Hook for tracking user activity time on components
 * Tracks total time, active time, idle time, and hidden time
 * Auto-saves periodically and uses sendBeacon on page close
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
    idleTimeout = DEFAULT_IDLE_TIMEOUT,
    autoSaveInterval = DEFAULT_AUTO_SAVE_INTERVAL,
    autoStart = true,
    enabled = true,
  } = options;

  // State
  const [isTracking, setIsTracking] = useState(false);
  const [isIdle, setIsIdle] = useState(false);
  const [isHidden, setIsHidden] = useState(false);

  // Refs for tracking time (using refs to avoid re-renders affecting calculations)
  const sessionIdRef = useRef<string>(generateSessionId());
  const startTimeRef = useRef<Date | null>(null);
  const totalTimeRef = useRef<number>(0);
  const activeTimeRef = useRef<number>(0);
  const idleTimeRef = useRef<number>(0);
  const hiddenTimeRef = useRef<number>(0);

  // Track when idle/hidden states started
  const idleStartRef = useRef<Date | null>(null);
  const hiddenStartRef = useRef<Date | null>(null);
  const lastActiveTimeRef = useRef<Date | null>(null);

  // Auto-save interval ref
  const autoSaveIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Track if component is mounted
  const isMountedRef = useRef(true);

  // Build the activity log data
  const buildActivityLogData = useCallback((): ActivityLogInput => {
    const now = new Date();

    // Calculate current totals
    let currentTotalTime = totalTimeRef.current;
    let currentActiveTime = activeTimeRef.current;
    let currentIdleTime = idleTimeRef.current;
    let currentHiddenTime = hiddenTimeRef.current;

    // Add time since last calculation
    if (startTimeRef.current && lastActiveTimeRef.current) {
      const elapsed = now.getTime() - lastActiveTimeRef.current.getTime();

      if (isIdle && idleStartRef.current) {
        currentIdleTime += now.getTime() - idleStartRef.current.getTime();
      } else if (isHidden && hiddenStartRef.current) {
        currentHiddenTime += now.getTime() - hiddenStartRef.current.getTime();
      } else {
        currentActiveTime += elapsed;
      }

      currentTotalTime = now.getTime() - startTimeRef.current.getTime();
    }

    return {
      sessionId: sessionIdRef.current,
      userId,
      submissionId,
      classId,
      componentType,
      componentId,
      subComponentId,
      totalTimeMs: currentTotalTime,
      activeTimeMs: currentActiveTime,
      idleTimeMs: currentIdleTime,
      hiddenTimeMs: currentHiddenTime,
      startedAt: startTimeRef.current?.toISOString() || now.toISOString(),
      endedAt: now.toISOString(),
    };
  }, [
    componentType,
    componentId,
    subComponentId,
    submissionId,
    classId,
    userId,
    isIdle,
    isHidden,
  ]);

  // Save activity log to API
  const saveActivityLog = useCallback(
    async (useSendBeacon = false) => {
      if (!startTimeRef.current) return;

      const data = buildActivityLogData();

      if (useSendBeacon && typeof navigator !== "undefined" && navigator.sendBeacon) {
        // Use sendBeacon for page unload (fire-and-forget)
        const blob = new Blob([JSON.stringify(data)], {
          type: "application/json",
        });
        navigator.sendBeacon("/api/activity-logs", blob);
      } else {
        // Use fetch for normal saves
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
      }
    },
    [buildActivityLogData]
  );

  // Start tracking
  const startTracking = useCallback(() => {
    if (isTracking || !enabled) return;

    const now = new Date();
    sessionIdRef.current = generateSessionId();
    startTimeRef.current = now;
    lastActiveTimeRef.current = now;
    totalTimeRef.current = 0;
    activeTimeRef.current = 0;
    idleTimeRef.current = 0;
    hiddenTimeRef.current = 0;
    idleStartRef.current = null;
    hiddenStartRef.current = null;

    setIsTracking(true);
    setIsIdle(false);
    setIsHidden(false);
  }, [isTracking, enabled]);

  // Stop tracking and save
  const stopTracking = useCallback(async () => {
    if (!isTracking) return;

    // Clear auto-save interval
    if (autoSaveIntervalRef.current) {
      clearInterval(autoSaveIntervalRef.current);
      autoSaveIntervalRef.current = null;
    }

    // Save final data
    await saveActivityLog(false);

    setIsTracking(false);
  }, [isTracking, saveActivityLog]);

  // Pause tracking
  const pauseTracking = useCallback(() => {
    if (!isTracking) return;

    // Update accumulated times before pausing
    const now = new Date();
    if (lastActiveTimeRef.current) {
      const elapsed = now.getTime() - lastActiveTimeRef.current.getTime();
      if (!isIdle && !isHidden) {
        activeTimeRef.current += elapsed;
      }
    }
    lastActiveTimeRef.current = null;
  }, [isTracking, isIdle, isHidden]);

  // Resume tracking
  const resumeTracking = useCallback(() => {
    if (!isTracking) return;
    lastActiveTimeRef.current = new Date();
  }, [isTracking]);

  // Handle idle state changes
  const onIdle = useCallback(() => {
    if (!isTracking) return;

    const now = new Date();

    // Save active time up to now
    if (lastActiveTimeRef.current && !isHidden) {
      const elapsed = now.getTime() - lastActiveTimeRef.current.getTime();
      activeTimeRef.current += elapsed;
    }

    idleStartRef.current = now;
    lastActiveTimeRef.current = now;
    setIsIdle(true);
  }, [isTracking, isHidden]);

  const onActive = useCallback(() => {
    if (!isTracking) return;

    const now = new Date();

    // Save idle time
    if (idleStartRef.current) {
      const idleElapsed = now.getTime() - idleStartRef.current.getTime();
      idleTimeRef.current += idleElapsed;
      idleStartRef.current = null;
    }

    lastActiveTimeRef.current = now;
    setIsIdle(false);
  }, [isTracking]);

  // Use react-idle-timer
  useIdleTimer({
    timeout: idleTimeout,
    onIdle,
    onActive,
    disabled: !isTracking || !enabled,
    throttle: 500,
  });

  // Handle visibility changes
  useEffect(() => {
    if (!isTracking || !enabled) return;

    const handleVisibilityChange = () => {
      const now = new Date();

      if (document.hidden) {
        // Page became hidden
        if (lastActiveTimeRef.current && !isIdle) {
          const elapsed = now.getTime() - lastActiveTimeRef.current.getTime();
          activeTimeRef.current += elapsed;
        }
        hiddenStartRef.current = now;
        lastActiveTimeRef.current = now;
        setIsHidden(true);
      } else {
        // Page became visible
        if (hiddenStartRef.current) {
          const hiddenElapsed = now.getTime() - hiddenStartRef.current.getTime();
          hiddenTimeRef.current += hiddenElapsed;
          hiddenStartRef.current = null;
        }
        lastActiveTimeRef.current = now;
        setIsHidden(false);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Check initial visibility
    if (document.hidden) {
      hiddenStartRef.current = new Date();
      setIsHidden(true);
    }

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isTracking, enabled, isIdle]);

  // Auto-save interval
  useEffect(() => {
    if (!isTracking || !enabled) return;

    autoSaveIntervalRef.current = setInterval(() => {
      saveActivityLog(false);
    }, autoSaveInterval);

    return () => {
      if (autoSaveIntervalRef.current) {
        clearInterval(autoSaveIntervalRef.current);
        autoSaveIntervalRef.current = null;
      }
    };
  }, [isTracking, enabled, autoSaveInterval, saveActivityLog]);

  // Handle page unload with sendBeacon
  useEffect(() => {
    if (!isTracking || !enabled) return;

    const handleBeforeUnload = () => {
      saveActivityLog(true);
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isTracking, enabled, saveActivityLog]);

  // Auto-start tracking on mount
  useEffect(() => {
    if (autoStart && enabled && !isTracking) {
      startTracking();
    }
  }, [autoStart, enabled, isTracking, startTracking]);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;

      // Save on unmount if still tracking
      if (isTracking && startTimeRef.current) {
        saveActivityLog(true);
      }

      // Clear interval
      if (autoSaveIntervalRef.current) {
        clearInterval(autoSaveIntervalRef.current);
      }
    };
  }, [isTracking, saveActivityLog]);

  // Calculate current time data for display
  const timeData = {
    totalTimeMs: startTimeRef.current
      ? Date.now() - startTimeRef.current.getTime()
      : 0,
    activeTimeMs: activeTimeRef.current,
    idleTimeMs: idleTimeRef.current,
    hiddenTimeMs: hiddenTimeRef.current,
    startedAt: startTimeRef.current,
  };

  return {
    isTracking,
    isIdle,
    isHidden,
    timeData,
    startTracking,
    stopTracking,
    pauseTracking,
    resumeTracking,
  };
}
