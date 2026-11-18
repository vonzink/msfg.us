/**
 * Speedometer scale maths shared by every calculator that shows a gauge.
 * Pure functions, no React, so the cutoffs can be unit tested. Each calculator keeps its own scales.
 *
 * Each dial has three zones (poor, fair, good) and each zone takes a third of the dial, so the
 * cutoffs always sit at the same two points whatever the units. Values past either end pin the
 * needle to that end.
 */

export type Rating = "poor" | "fair" | "good";

export type Scale = {
  /** Value at the far left of the dial. */
  min: number;
  /** Where the fair zone starts. */
  fair: number;
  /** Where the good zone starts. */
  good: number;
  /** Value at the far right of the dial. */
  max: number;
};

export const RATING_LABEL: Record<Rating, string> = { poor: "Poor", fair: "Fair", good: "Good" };

/** Which zone a value falls in. A value exactly on a cutoff gets the better zone. */
export function rate(value: number, s: Scale): Rating {
  if (value >= s.good) return "good";
  if (value >= s.fair) return "fair";
  return "poor";
}

/** Needle position from 0 (far left) to 1 (far right). */
export function dialPosition(value: number, s: Scale): number {
  const within = (v: number, lo: number, hi: number) =>
    hi > lo ? Math.min(1, Math.max(0, (v - lo) / (hi - lo))) : 0;
  if (value < s.fair) return within(value, s.min, s.fair) / 3;
  if (value < s.good) return (1 + within(value, s.fair, s.good)) / 3;
  return (2 + within(value, s.good, s.max)) / 3;
}
