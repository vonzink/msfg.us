/**
 * Today's-rates data for /rates. Ported verbatim from the prototype
 * (design-reference/.../prototype/rates.jsx → RATE_DATA).
 *
 * ALL rate values, APRs, points, and the RATES_UPDATED timestamp are
 * [PLACEHOLDER] — wire to MSFG's real rate feed before launch. Do NOT
 * compute the timestamp at runtime (breaks SSG determinism); it is a
 * fixed display string.
 */

export type ApplyIntent = "buy" | "refi";

export type RateRow = {
  /** Product name, e.g. "30-Year Fixed". */
  product: string;
  /** Secondary qualifier, e.g. "Conventional" / "VA IRRRL". */
  subLabel: string;
  /** Note rate, percent. [PLACEHOLDER] */
  rate: number;
  /** Annual percentage rate, percent. [PLACEHOLDER] */
  apr: number;
  /** Discount points display string, e.g. "0.5 pts". [PLACEHOLDER] */
  points: string;
  /** Which application flow the "Get my rate" link routes to. */
  applyIntent: ApplyIntent;
  /** Amortization term used for the Est. monthly estimate (HELOC = 240). */
  termMonths: number;
};

export type RateTab = "purchase" | "refinance";

export const RATE_DATA: Record<RateTab, RateRow[]> = {
  purchase: [
    // [PLACEHOLDER] rate / apr / points
    { product: "30-Year Fixed", subLabel: "Conventional", rate: 6.375, apr: 6.512, points: "0.5 pts", applyIntent: "buy", termMonths: 360 },
    { product: "15-Year Fixed", subLabel: "Conventional", rate: 5.625, apr: 5.788, points: "0.4 pts", applyIntent: "buy", termMonths: 360 },
    { product: "30-Year Fixed", subLabel: "FHA", rate: 5.875, apr: 6.642, points: "0.6 pts", applyIntent: "buy", termMonths: 360 },
    { product: "30-Year Fixed", subLabel: "VA", rate: 5.750, apr: 6.018, points: "0.3 pts", applyIntent: "buy", termMonths: 360 },
    { product: "30-Year Fixed", subLabel: "Jumbo", rate: 6.625, apr: 6.731, points: "0.5 pts", applyIntent: "buy", termMonths: 360 },
    { product: "7/6 ARM", subLabel: "Conventional", rate: 5.999, apr: 6.842, points: "0.5 pts", applyIntent: "buy", termMonths: 360 },
  ],
  refinance: [
    // [PLACEHOLDER] rate / apr / points
    { product: "30-Year Fixed", subLabel: "Rate & term", rate: 6.125, apr: 6.268, points: "0.5 pts", applyIntent: "refi", termMonths: 360 },
    { product: "15-Year Fixed", subLabel: "Rate & term", rate: 5.500, apr: 5.661, points: "0.4 pts", applyIntent: "refi", termMonths: 360 },
    { product: "30-Year Fixed", subLabel: "Cash-out", rate: 6.750, apr: 6.918, points: "0.6 pts", applyIntent: "refi", termMonths: 360 },
    { product: "30-Year Fixed", subLabel: "VA IRRRL", rate: 5.625, apr: 5.889, points: "0.3 pts", applyIntent: "refi", termMonths: 360 },
    { product: "30-Year Fixed", subLabel: "FHA streamline", rate: 5.750, apr: 6.501, points: "0.5 pts", applyIntent: "refi", termMonths: 360 },
    { product: "HELOC", subLabel: "Variable", rate: 7.250, apr: 7.250, points: "0 pts", applyIntent: "refi", termMonths: 240 },
  ],
};

/** Loan amount the Est. monthly column amortizes. Matches the disclaimer. */
export const RATES_PRINCIPAL = 300000;

/**
 * Display-only "Updated …" timestamp. MUST be a static string — never call
 * Date.now()/new Date() at module or render scope (breaks SSG determinism).
 * [PLACEHOLDER] — replace with the live feed's last-updated stamp.
 */
export const RATES_UPDATED = "June 1, 2026 · 8:00 AM MT"; // [PLACEHOLDER]
