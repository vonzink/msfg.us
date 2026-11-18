/**
 * The words around the Rate buydown calculator. Drafted for review by the compliance sign-off.
 * Rules: plain language, no formulas, results are estimates, and nothing that reads as a loan
 * decision or a rate offer. The full payment is always stated alongside the reduced ones.
 */
export const HOW_IT_WORKS: string[] = [
  "A temporary buydown lowers the interest rate, and so the payment, for the first one to three years of the loan. After that the payment returns to the full amount and stays there for the rest of the loan.",
  "The name tells you the pattern, in percentage points off the rate for each early year. A 2-1 buydown takes 2 off in the first year and 1 off in the second. A 3-2-1 takes 3, then 2, then 1 over three years. A 1-1 takes 1 off for two years, and a 1-0 takes 1 off for the first year only.",
  "The loan itself is written at the full rate from the start. The buydown cost is paid up front into an account, and each month that account makes up the difference between the reduced payment and the full one. The cost shown here is the total of those differences.",
  "Someone has to fund that account at closing. It is often a seller or a builder as part of the deal, or a lender credit. That is why a buydown usually comes up while a purchase is being negotiated.",
  "This calculator covers temporary buydowns only. Paying discount points to lower the rate for the whole life of the loan is a different choice, with a different cost.",
];

export const QUESTIONS: { q: string; a: string }[] = [
  {
    q: "Who pays for a buydown?",
    a: "Most often the seller or a home builder, as a concession written into the purchase contract. A lender credit can also cover it. The cost above is an estimate of what that credit would need to cover; a loan officer can confirm the exact figure.",
  },
  {
    q: "What happens when the buydown ends?",
    a: "The payment goes up to the full amount shown above and stays there. Nothing about the loan changes at that point. The account that was covering part of the payment has simply been used up, so plan your budget around the full payment, not the first-year one.",
  },
  {
    q: "Is a buydown better than a lower price?",
    a: "They help in different ways. A buydown gives the most relief in the first years and none after. A lower price reduces the loan, and so the payment, for as long as you have it. If you expect to stay a long time, compare the two with a loan officer.",
  },
  {
    q: "What happens to the buydown money if I sell or refinance early?",
    a: "Money still in the buydown account is normally applied to the loan balance when the loan is paid off. The exact handling is set by the buydown agreement, so ask how it works before closing.",
  },
];
