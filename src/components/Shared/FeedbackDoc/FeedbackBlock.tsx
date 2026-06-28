"use client";

import type { FeedbackBlock as FeedbackBlockType } from "@/types/feedbackDoc";
import { SectionBlock } from "./blocks/SectionBlock";

export interface FeedbackBlockProps {
  block: FeedbackBlockType;
}

/**
 * Renders one block of the feedback doc. Switched on `kind` exactly like
 * ActionCard; `default: return null` keeps the renderer forward-compatible if a
 * newer doc carries a block kind this client doesn't know. (The rubric breakdown
 * is not a block — FeedbackDocView appends it from rubric_scores.)
 */
export function FeedbackBlock({ block }: FeedbackBlockProps) {
  switch (block.kind) {
    case "section":
      return <SectionBlock block={block} />;
    default:
      return null;
  }
}
