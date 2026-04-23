"use client";

import { createContext, useContext } from "react";

interface AssessmentTrackingContextValue {
  trackFeedbackOpened: () => void;
  trackFinishMarkCompleteClicked: () => void;
}

const noop = () => {};

const AssessmentTrackingContext = createContext<AssessmentTrackingContextValue>({
  trackFeedbackOpened: noop,
  trackFinishMarkCompleteClicked: noop,
});

interface AssessmentTrackingProviderProps {
  children: React.ReactNode;
  value: AssessmentTrackingContextValue;
}

export function AssessmentTrackingProvider({
  children,
  value,
}: AssessmentTrackingProviderProps) {
  return (
    <AssessmentTrackingContext.Provider value={value}>
      {children}
    </AssessmentTrackingContext.Provider>
  );
}

export function useAssessmentTracking() {
  return useContext(AssessmentTrackingContext);
}

