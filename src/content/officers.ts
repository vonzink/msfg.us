/**
 * Loan officer directory data — single source of truth for /loan-officers.
 *
 * [PLACEHOLDER] Every officer below (names, NMLS numbers, cities, ratings,
 * specialties) is fabricated for the prototype. Replace with real, licensed
 * MSFG loan officers — including verified NMLS IDs and photos — before the
 * apex (production) launch. Ported from the design prototype
 * (design-reference/.../prototype/officers.jsx).
 */

export type OfficerRating = {
  /** Average star rating, 0–5 (e.g. 4.9). [PLACEHOLDER] */
  avg: number;
  /** Number of reviews behind the average. [PLACEHOLDER] */
  count: number;
};

export type Officer = {
  /** Full name. [PLACEHOLDER] */
  name: string;
  /** NMLS unique identifier (string to preserve leading digits). [PLACEHOLDER] */
  nmls: string;
  /** City of the officer's home branch. */
  city: string;
  /** USPS two-letter state code; must match a SITE.states entry. */
  state: string;
  /** Languages spoken, in display order (English first). */
  languages: string[];
  /** Lending specialties shown as pill chips. */
  specialties: string[];
  /** Aggregate review rating. [PLACEHOLDER] */
  rating: OfficerRating;
  /** "Schedule" action target (the apply wizard) — fallback when no calendar. */
  scheduleHref: string;
  /**
   * Optional per-officer GoHighLevel booking calendar id. When set, the
   * "Schedule" action opens this officer's calendar in a modal instead of the
   * apply wizard; otherwise it falls back to NEXT_PUBLIC_GHL_CALENDAR_ID, then
   * to `scheduleHref`. [PLACEHOLDER] — populate with each officer's real GHL
   * calendar id before launch.
   */
  calendarId?: string;
  /** Optional "Text" action target (sms:/tel:); omitted = placeholder link. */
  textHref?: string;
};

export const OFFICERS: Officer[] = [
  {
    name: "Mara Hollister", // [PLACEHOLDER]
    nmls: "482310", // [PLACEHOLDER]
    city: "Westminster",
    state: "CO",
    languages: ["English"],
    specialties: ["First-time", "VA"],
    rating: { avg: 4.9, count: 184 }, // [PLACEHOLDER]
    scheduleHref: "/apply/buy",
  },
  {
    name: "Diego Reyes", // [PLACEHOLDER]
    nmls: "598221", // [PLACEHOLDER]
    city: "Fargo",
    state: "ND",
    languages: ["English", "Español"],
    specialties: ["Self-employed", "Non-QM"],
    rating: { avg: 5.0, count: 96 }, // [PLACEHOLDER]
    scheduleHref: "/apply/buy",
  },
  {
    name: "Priya Anand", // [PLACEHOLDER]
    nmls: "611980", // [PLACEHOLDER]
    city: "Westminster",
    state: "CO",
    languages: ["English", "हिंदी"],
    specialties: ["Jumbo", "Investment"],
    rating: { avg: 4.9, count: 132 }, // [PLACEHOLDER]
    scheduleHref: "/apply/buy",
  },
  {
    name: "Thomas Whitford", // [PLACEHOLDER]
    nmls: "402117", // [PLACEHOLDER]
    city: "Bismarck",
    state: "ND",
    languages: ["English"],
    specialties: ["USDA", "Conventional"],
    rating: { avg: 4.8, count: 218 }, // [PLACEHOLDER]
    scheduleHref: "/apply/buy",
  },
  {
    name: "Lena Park", // [PLACEHOLDER]
    nmls: "705443", // [PLACEHOLDER]
    city: "Westminster",
    state: "CO",
    languages: ["English", "한국어"],
    specialties: ["FHA", "First-time"],
    rating: { avg: 5.0, count: 71 }, // [PLACEHOLDER]
    scheduleHref: "/apply/buy",
  },
  {
    name: "Marcus Hale", // [PLACEHOLDER]
    nmls: "550129", // [PLACEHOLDER]
    city: "Fargo",
    state: "ND",
    languages: ["English"],
    specialties: ["Refinance", "Second home"],
    rating: { avg: 4.9, count: 143 }, // [PLACEHOLDER]
    scheduleHref: "/apply/buy",
  },
];

/** Build the initials shown in an officer's avatar tile (e.g. "Mara Hollister" → "MH"). */
export function officerInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/** Distinct languages present across all officers, in first-seen order. */
export function officerLanguages(officers: Officer[] = OFFICERS): string[] {
  const seen = new Set<string>();
  for (const o of officers) {
    for (const lang of o.languages) seen.add(lang);
  }
  return [...seen];
}

/** Distinct specialties present across all officers, in first-seen order. */
export function officerSpecialties(officers: Officer[] = OFFICERS): string[] {
  const seen = new Set<string>();
  for (const o of officers) {
    for (const s of o.specialties) seen.add(s);
  }
  return [...seen];
}
