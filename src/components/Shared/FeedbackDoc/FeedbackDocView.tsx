"use client";

import { Component, type ReactNode } from "react";
import { type FeedbackDoc } from "@/types/feedbackDoc";
import type { RubricScore } from "@/types/submission";
import { FeedbackBlock } from "./FeedbackBlock";
import { RubricBreakdown } from "./RubricBreakdown";

export interface FeedbackDocViewProps {
  doc: FeedbackDoc;
  rubricScores?: RubricScore[] | null;
  useStarDisplay?: boolean;
  starScale?: number;
  /** Plain-text feedback rendered if the structured render throws (legacy fallback). */
  fallbackText?: string | null;
}

/**
 * Error boundary that falls back to legacy plain-text feedback if any block
 * render throws — so a structured doc can never crash the feedback panel.
 */
class FeedbackDocBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error("[FeedbackDocView] render failed, falling back:", error);
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

/**
 * Top-level renderer for a structured feedback document. Maps over the narrative
 * section blocks, then always appends the rubric breakdown last (from
 * rubricScores) when scores exist — so the grade is consistently placed and
 * never duplicated/desynced from the doc.
 */
export function FeedbackDocView({
  doc,
  rubricScores,
  useStarDisplay = false,
  starScale = 5,
  fallbackText,
}: FeedbackDocViewProps) {
  const hasRubricScores = !!rubricScores && rubricScores.length > 0;

  const fallback = fallbackText ? (
    <div className="p-3 bg-muted/50 rounded-md">
      <p className="text-sm whitespace-pre-wrap">{fallbackText}</p>
    </div>
  ) : null;

  return (
    <FeedbackDocBoundary fallback={fallback}>
      <div className="space-y-4">
        {doc.blocks.map((block, i) => (
          <FeedbackBlock key={i} block={block} />
        ))}
        {hasRubricScores && (
          <RubricBreakdown
            rubricScores={rubricScores ?? []}
            useStarDisplay={useStarDisplay}
            starScale={starScale}
          />
        )}
      </div>
    </FeedbackDocBoundary>
  );
}
