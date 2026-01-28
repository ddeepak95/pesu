"use client";

import { createContext, useContext, ReactNode } from "react";

interface ActivityTrackingContextType {
  userId?: string;
  classId?: string;
  submissionId?: string;
}

const ActivityTrackingContext = createContext<ActivityTrackingContextType>({});

interface ActivityTrackingProviderProps {
  children: ReactNode;
  userId?: string;
  classId?: string;
  submissionId?: string;
}

/**
 * Provider for activity tracking context values
 * Wrap components that need access to tracking context (classId, userId, submissionId)
 */
export function ActivityTrackingProvider({
  children,
  userId,
  classId,
  submissionId,
}: ActivityTrackingProviderProps) {
  return (
    <ActivityTrackingContext.Provider value={{ userId, classId, submissionId }}>
      {children}
    </ActivityTrackingContext.Provider>
  );
}

/**
 * Hook to access activity tracking context values
 * Returns undefined values if used outside of provider (graceful fallback)
 */
export function useActivityTrackingContext(): ActivityTrackingContextType {
  return useContext(ActivityTrackingContext);
}
