import { StarRating } from "@/types/submission";

/**
 * Converts points to star rating using proportional calculation
 * @param points - Points earned
 * @param maxPoints - Maximum possible points
 * @param starScale - Number of stars in the scale (e.g., 5, 10, 20)
 * @returns StarRating object with exact star value, max stars, and percentage
 */
export function pointsToStars(
  points: number,
  maxPoints: number,
  starScale: number
): StarRating {
  // Handle edge cases
  if (maxPoints === 0 || starScale <= 0) {
    return { stars: 0, maxStars: starScale, percentage: 0 };
  }

  // Calculate percentage
  const percentage = (points / maxPoints) * 100;

  // Calculate proportional star rating
  const stars = (points / maxPoints) * starScale;

  return {
    stars: Math.max(0, Math.min(stars, starScale)), // Clamp between 0 and starScale
    maxStars: starScale,
    percentage,
  };
}

/**
 * Formats star display for accessibility and fallback text
 * @param stars - Star rating value
 * @param maxStars - Maximum stars in scale
 * @param showNumeric - Whether to show numeric representation
 * @returns Formatted string (e.g., "4.5/5 stars" or "4.5 out of 5 stars")
 */
export function formatStarDisplay(
  stars: number,
  maxStars: number,
  showNumeric: boolean = false
): string {
  const roundedStars = Math.round(stars * 10) / 10; // Round to 1 decimal
  
  if (showNumeric) {
    return `${roundedStars}/${maxStars}`;
  }
  
  return `${roundedStars} out of ${maxStars} stars`;
}
