"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Hook to require authentication for a page.
 * If user is not authenticated, redirects to login with return URL.
 * After login, user will be redirected back to the original page.
 * 
 * @returns { isAuthenticated, isLoading } - Auth state
 */
export function useRequireAuth() {
  const { user, loading } = useAuth();
  const hasRedirected = useRef(false);
  const [currentPath, setCurrentPath] = useState<string | null>(null);

  // Get the current path on mount (client-side only)
  useEffect(() => {
    if (typeof window !== "undefined") {
      const path = window.location.pathname + window.location.search;
      console.log("[useRequireAuth] Setting current path:", path);
      setCurrentPath(path);
    }
  }, []);

  useEffect(() => {
    console.log("[useRequireAuth] State:", { 
      loading, 
      user: user?.email || null, 
      currentPath, 
      hasRedirected: hasRedirected.current 
    });

    // Wait for auth to finish loading and path to be set
    if (loading) {
      console.log("[useRequireAuth] Still loading auth...");
      return;
    }
    
    if (currentPath === null) {
      console.log("[useRequireAuth] Current path not set yet...");
      return;
    }

    // If not authenticated and haven't redirected yet, redirect to login
    if (!user && !hasRedirected.current) {
      hasRedirected.current = true;
      const returnUrl = encodeURIComponent(currentPath);
      const loginUrl = `/teacher/login?redirect=${returnUrl}`;
      console.log("[useRequireAuth] NOT AUTHENTICATED - Redirecting to:", loginUrl);
      // Use replace to avoid back-button issues
      window.location.replace(loginUrl);
    } else if (user) {
      console.log("[useRequireAuth] User is authenticated:", user.email);
    }
  }, [user, loading, currentPath]);

  return {
    isAuthenticated: !!user,
    isLoading: loading || currentPath === null,
    user,
  };
}

