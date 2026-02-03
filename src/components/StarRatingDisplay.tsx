"use client";

import React from "react";
import { StarIcon } from "./StarIcon";
import { pointsToStars, formatStarDisplay } from "@/lib/utils/starConversion";

interface StarRatingDisplayProps {
  /**
   * Points earned
   */
  points: number;
  /**
   * Maximum possible points
   */
  maxPoints: number;
  /**
   * Number of stars in the scale (e.g., 5, 10, 20)
   */
  starScale: number;
  /**
   * Size variant
   */
  size?: "small" | "medium" | "large";
  /**
   * Whether to show numeric text alongside stars (for teacher views)
   */
  showNumeric?: boolean;
  /**
   * Additional CSS classes
   */
  className?: string;
}

/**
 * Displays a star rating converted from points
 * Shows only visual stars for students, optionally numeric for teachers
 */
export function StarRatingDisplay({
  points,
  maxPoints,
  starScale,
  size = "medium",
  showNumeric = false,
  className = "",
}: StarRatingDisplayProps) {
  const { stars, maxStars, percentage } = pointsToStars(
    points,
    maxPoints,
    starScale
  );

  // Size mappings
  const sizeMap = {
    small: { starSize: 16, gap: "gap-0.5", text: "text-sm" },
    medium: { starSize: 24, gap: "gap-1", text: "text-base" },
    large: { starSize: 32, gap: "gap-1.5", text: "text-lg" },
  };

  const { starSize, gap, text } = sizeMap[size];

  // Generate array of stars with their fill values
  const starArray = Array.from({ length: maxStars }, (_, index) => {
    const starNumber = index + 1;
    if (stars >= starNumber) {
      return 1; // Full star
    } else if (stars > index && stars < starNumber) {
      return stars - index; // Partial star
    } else {
      return 0; // Empty star
    }
  });

  // Accessibility label
  const ariaLabel = formatStarDisplay(stars, maxStars, false);

  return (
    <div
      className={`flex items-center ${gap} ${className}`}
      role="img"
      aria-label={ariaLabel}
    >
      {/* Visual stars */}
      <div className={`flex items-center ${gap}`}>
        {starArray.map((fill, index) => (
          <StarIcon key={index} fill={fill} size={starSize} />
        ))}
      </div>

      {/* Optional numeric display */}
      {showNumeric && (
        <span className={`ml-2 font-semibold ${text} text-muted-foreground`}>
          {formatStarDisplay(stars, maxStars, true)}
        </span>
      )}
    </div>
  );
}
