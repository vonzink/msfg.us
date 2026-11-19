/**
 * The one list of public calculators. The menu, the sitemap and the /calculators landing page all
 * read it, so adding a calculator is one entry here plus its folder and route.
 *
 * Names and URLs live here, in code, because a URL must not change from an admin screen.
 * A tenant switches a calculator off with `calculators.disabled` in its config.
 * The generated MBS page (src/calculators/mbs/) is unlisted on purpose and is never registered.
 */
export type CalculatorEntry = {
  /** Folder name under src/calculators/ and the last URL segment. */
  slug: string;
  path: `/calculators/${string}`;
  /** Menu label. */
  label: string;
  /** The visitor's question, used as the page heading and the landing card title. */
  question: string;
  /** One sentence for the landing card. */
  description: string;
  /** Where the call to action under the results goes. */
  applyHref: "/apply/buy" | "/apply/refi";
};

export const CALCULATORS: CalculatorEntry[] = [
  {
    slug: "mortgage",
    path: "/calculators/mortgage",
    label: "Mortgage calculator",
    question: "What will my mortgage payment be?",
    description: "Estimate your monthly payment with taxes and insurance, and see how extra payments change the payoff.",
    applyHref: "/apply/buy",
  },
  {
    slug: "buydown",
    path: "/calculators/buydown",
    label: "Rate buydown calculator",
    question: "What does a rate buydown cost?",
    description: "See the lower payments a temporary buydown gives in the first years, what it costs up front, and the payment after it ends.",
    applyHref: "/apply/buy",
  },
  {
    slug: "blended-rate",
    path: "/calculators/blended-rate",
    label: "Blended rate calculator",
    question: "What rate am I really paying across my debts?",
    description: "Combine a mortgage with a second loan, a credit line or other debts and see the single rate they add up to.",
    applyHref: "/apply/refi",
  },
  {
    slug: "refinance-breakeven",
    path: "/calculators/refinance-breakeven",
    label: "Refinance breakeven calculator",
    question: "How long until a refinance pays for itself?",
    description: "See the new payment, how many months it takes to recover the closing costs, and the interest over the life of each loan.",
    applyHref: "/apply/refi",
  },
  {
    slug: "rent-vs-buy",
    path: "/calculators/rent-vs-buy",
    label: "Rent vs buy calculator",
    question: "Does renting or buying cost less over time?",
    description: "Compare the cost of renting with the cost of buying over the years you plan to stay, and see whether and when buying pulls ahead.",
    applyHref: "/apply/buy",
  },
  {
    slug: "budget",
    path: "/calculators/budget",
    label: "Home budget calculator",
    question: "What is left each month after my house payment and bills?",
    description: "See how much of your income goes to housing and debts, and what is left each month after your bills.",
    applyHref: "/apply/buy",
  },
  {
    slug: "apr",
    path: "/calculators/apr",
    label: "APR calculator",
    question: "What is the APR on a loan once fees are counted?",
    description: "See how lender fees, points and mortgage insurance turn an interest rate into an APR.",
    applyHref: "/apply/buy",
  },
  {
    slug: "investment",
    path: "/calculators/investment",
    label: "Investment calculator",
    question: "Will this rental pay off?",
    description: "See the cash flow, tax effect, equity and five-year return on a rental property.",
    applyHref: "/apply/buy",
  },
];

type Settings = { disabled: string[] };

/** Registered calculators this tenant has not switched off, in menu order. */
export function enabledCalculators(settings: Settings): CalculatorEntry[] {
  return CALCULATORS.filter((c) => !settings.disabled.includes(c.slug));
}

export function isCalculatorEnabled(slug: string, settings: Settings): boolean {
  return enabledCalculators(settings).some((c) => c.slug === slug);
}
