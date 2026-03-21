"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Assignment } from "@/types/assignment";
import {
  appendTabLeaveEvent,
  setSubmissionIntegrityRevoked,
} from "@/lib/queries/submissions";
import { getEffectiveTabSwitchPolicy } from "@/lib/integrity/assignmentPolicy";
import { INTEGRITY_REVOKED_REASON_TAB_SWITCH_THRESHOLD } from "@/lib/integrity/constants";

export type TabWarningQuota = { used: number; max: number };

/** Collapse blur+visibilityhidden bursts into one logged leave (ms). */
const LEAVE_DEDUPE_MS = 450;

export function useTabLeaveTracking(params: {
  submissionId: string | null;
  assignment: Pick<Assignment, "tab_switch_policy" | "tab_switch_max_leaves">;
  onAccessRevoked?: () => void;
  /** When true, tab warnings are suppressed (e.g. integrity already revoked). */
  integrityAccessRevoked?: boolean;
  /**
   * When false, listeners are detached (e.g. name entry, results, or non-input assessment UI).
   * Defaults to true.
   */
  active?: boolean;
}) {
  const {
    submissionId,
    assignment,
    onAccessRevoked,
    integrityAccessRevoked,
    active = true,
  } = params;
  const [showTabWarning, setShowTabWarning] = useState(false);
  const [tabWarningQuota, setTabWarningQuota] = useState<TabWarningQuota | null>(
    null,
  );
  const onAccessRevokedRef = useRef(onAccessRevoked);
  const integrityAccessRevokedRef = useRef(!!integrityAccessRevoked);

  useEffect(() => {
    onAccessRevokedRef.current = onAccessRevoked;
  }, [onAccessRevoked]);

  useEffect(() => {
    integrityAccessRevokedRef.current = !!integrityAccessRevoked;
  }, [integrityAccessRevoked]);

  /** Leave count after the most recent recorded leave. */
  const lastLeaveCountRef = useRef<number | null>(null);
  const lastLeaveRecordedAtRef = useRef(0);
  /** True after a window blur leave while tab stayed visible (tiled windows); cleared on return or tab hide. */
  const pendingBlurReturnRef = useRef(false);

  const policy = getEffectiveTabSwitchPolicy(assignment);
  const maxLeaves = assignment.tab_switch_max_leaves ?? null;

  const dismissTabWarning = useCallback(() => {
    setShowTabWarning(false);
    setTabWarningQuota(null);
  }, []);

  useEffect(() => {
    if (!integrityAccessRevoked) return;
    queueMicrotask(() => dismissTabWarning());
  }, [integrityAccessRevoked, dismissTabWarning]);

  useEffect(() => {
    lastLeaveRecordedAtRef.current = 0;
    pendingBlurReturnRef.current = false;
    lastLeaveCountRef.current = null;
  }, [submissionId]);

  useEffect(() => {
    if (!active) {
      queueMicrotask(() => dismissTabWarning());
      return;
    }
    if (!submissionId || typeof document === "undefined") return;

    let lastVisibility: DocumentVisibilityState | undefined =
      document.visibilityState;

    const showReturnWarning = () => {
      if (integrityAccessRevokedRef.current) return;

      if (policy === "warn") {
        setTabWarningQuota(null);
        setShowTabWarning(true);
      } else if (
        policy === "block_after_threshold" &&
        maxLeaves != null &&
        maxLeaves >= 1
      ) {
        const used = lastLeaveCountRef.current ?? 0;
        if (used >= maxLeaves) return;
        setTabWarningQuota({ used, max: maxLeaves });
        setShowTabWarning(true);
      }
    };

    /** Sync dedupe + reserve slot; call before scheduling async append. */
    const beginTabLeaveAttempt = (): boolean => {
      const now = Date.now();
      if (now - lastLeaveRecordedAtRef.current < LEAVE_DEDUPE_MS) {
        return false;
      }
      lastLeaveRecordedAtRef.current = now;
      return true;
    };

    const finishTabLeaveRecord = async () => {
      const timestamp = new Date().toISOString();
      const leaveCount = await appendTabLeaveEvent(submissionId, timestamp);

      if (leaveCount != null) {
        lastLeaveCountRef.current = leaveCount;
      }

      if (
        policy === "block_after_threshold" &&
        leaveCount != null &&
        maxLeaves != null &&
        maxLeaves >= 1 &&
        leaveCount >= maxLeaves
      ) {
        try {
          await setSubmissionIntegrityRevoked(submissionId, {
            reason: INTEGRITY_REVOKED_REASON_TAB_SWITCH_THRESHOLD,
          });
          onAccessRevokedRef.current?.();
        } catch (e) {
          console.error("setSubmissionIntegrityRevoked failed:", e);
        }
      }
    };

    const handleVisibilityChange = () => {
      const current = document.visibilityState;
      const prev = lastVisibility;
      lastVisibility = current;

      void (async () => {
        if (current === "hidden") {
          pendingBlurReturnRef.current = false;
          if (!beginTabLeaveAttempt()) return;
          await finishTabLeaveRecord();
        } else if (current === "visible" && prev === "hidden") {
          showReturnWarning();
        }
      })();
    };

    const handleWindowBlur = () => {
      if (document.visibilityState !== "visible") return;
      if (!beginTabLeaveAttempt()) return;
      pendingBlurReturnRef.current = true;
      void finishTabLeaveRecord();
    };

    const handleWindowFocus = () => {
      if (document.visibilityState !== "visible") return;
      if (!pendingBlurReturnRef.current) return;
      pendingBlurReturnRef.current = false;
      showReturnWarning();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleWindowBlur);
    window.addEventListener("focus", handleWindowFocus);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleWindowBlur);
      window.removeEventListener("focus", handleWindowFocus);
    };
  }, [submissionId, policy, maxLeaves, active, dismissTabWarning]);

  return { showTabWarning, dismissTabWarning, tabWarningQuota };
}
