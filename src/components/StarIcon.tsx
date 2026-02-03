import React from "react";

interface StarIconProps {
  /**
   * Fill percentage: 0 = empty, 0.5 = half, 1 = full
   */
  fill: number;
  /**
   * Size of the star in pixels
   */
  size?: number;
  /**
   * CSS class name
   */
  className?: string;
}

/**
 * SVG star icon that supports full, partial, and empty states
 * Uses clip-path for partial fill effect
 */
export function StarIcon({ fill, size = 24, className = "" }: StarIconProps) {
  const fillPercentage = Math.max(0, Math.min(1, fill)); // Clamp between 0 and 1
  const id = `star-fill-${Math.random().toString(36).substr(2, 9)}`; // Unique ID for clip path

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <clipPath id={id}>
          <rect x="0" y="0" width={`${fillPercentage * 100}%`} height="24" />
        </clipPath>
      </defs>

      {/* Empty star (background) */}
      <path
        d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
        fill="none"
        stroke="#E0E0E0"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Filled portion */}
      {fillPercentage > 0 && (
        <path
          d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
          fill="#FFC107"
          clipPath={`url(#${id})`}
        />
      )}
    </svg>
  );
}
