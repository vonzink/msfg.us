/**
 * The words around the Refinance breakeven calculator. Drafted for review by the compliance
 * sign-off. Rules: plain language, no formulas, results are estimates, and nothing that reads as
 * a recommendation to refinance, a rate offer or a loan decision.
 */
export const HOW_IT_WORKS: string[] = [
  "A refinance costs money up front and, if the new payment is lower, saves money each month. The breakeven is how many months of savings it takes to cover the closing costs.",
  "The breakeven only matters if you keep the loan that long. If you expect to sell or refinance again before then, the closing costs are not recovered. Add how long you plan to keep the loan under Add detail to see the net figure for that period.",
  "A new loan also restarts the term. Replacing a loan with 22 years left with a new 30-year loan lowers the payment partly by adding eight years of payments. That can mean more interest in total, even at a lower rate, so the calculator always shows the interest over the life of each loan beside the breakeven.",
  "The payments shown are principal and interest, plus mortgage insurance if you enter it. Property tax and homeowners insurance are left out because a refinance does not change them. Closing costs are the single total you typed in.",
];

export const QUESTIONS: { q: string; a: string }[] = [
  {
    q: "What counts as closing costs?",
    a: "The lender's fees, the appraisal, title and recording charges on the new loan. A loan officer's quote or a Loan Estimate gives a total. Money set aside for tax and insurance is not a cost of the refinance and should be left out.",
  },
  {
    q: "What if the closing costs are added to the loan?",
    a: "Then you pay less at closing but owe more. Enter the full new loan amount under Add detail. The payment rises a little, and the breakeven still shows how long the savings take to cover those costs.",
  },
  {
    q: "Why does the new loan show more interest when the rate is lower?",
    a: "Because it runs longer. Interest is paid for every year a balance is owed, so adding years can outweigh a lower rate. Choosing a shorter new term, or paying extra each month, reduces it.",
  },
  {
    q: "Is a short breakeven enough to decide?",
    a: "It is one part of the picture. How long you will keep the loan, the interest over its life and whether you are taking cash out all matter. A loan officer can go through them with your actual figures.",
  },
];
