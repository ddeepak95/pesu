"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { showErrorToast } from "@/lib/toast";

export type MicPermissionState = "unknown" | "prompt" | "granted" | "denied";

function toMicState(permissionState: PermissionState): MicPermissionState {
  if (permissionState === "granted") return "granted";
  if (permissionState === "denied") return "denied";
  return "prompt";
}

/**
 * Tracks browser microphone permission and exposes a user-gesture
 * request that warms permission via getUserMedia then releases tracks.
 */
export function useMicrophonePermission() {
  const [state, setState] = useState<MicPermissionState>("unknown");
  const permissionStatusRef = useRef<PermissionStatus | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const permissions = navigator.permissions;
    if (!permissions?.query) {
      queueMicrotask(() => setState("prompt"));
      return;
    }

    const onPermissionChange = () => {
      const ps = permissionStatusRef.current;
      if (ps) setState(toMicState(ps.state));
    };

    let cancelled = false;
    permissions
      .query({ name: "microphone" as PermissionName })
      .then((ps) => {
        if (cancelled) return;
        permissionStatusRef.current = ps;
        setState(toMicState(ps.state));
        ps.addEventListener("change", onPermissionChange);
      })
      .catch(() => {
        if (!cancelled) setState("prompt");
      });

    return () => {
      cancelled = true;
      const ps = permissionStatusRef.current;
      if (ps) {
        ps.removeEventListener("change", onPermissionChange);
        permissionStatusRef.current = null;
      }
    };
  }, []);

  const requestAccess = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      showErrorToast("Microphone is not available in this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setState("granted");
    } catch (e) {
      const err = e instanceof DOMException ? e : null;
      if (err?.name === "NotAllowedError" || err?.name === "PermissionDeniedError") {
        setState("denied");
        showErrorToast(
          "Microphone access was denied. Allow the microphone in your browser settings to continue.",
        );
      } else {
        showErrorToast(
          err?.message ??
            "Could not access the microphone. Check the console for details.",
        );
      }
    }
  }, []);

  return { state, requestAccess };
}
