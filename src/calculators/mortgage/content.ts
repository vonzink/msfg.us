/**
 * The words around the Mortgage calculator. Drafted for review by the compliance sign-off.
 * Rules: plain language, no formulas, results are estimates, and nothing that reads as a loan
 * decision or a rate offer.
 */
export const HOW_IT_WORKS: string[] = [
  "Purchase starts from a home price and a down payment. Refinance starts from a loan amount and, if you enter one, the home value. Payment starts from a monthly principal and interest payment and gives the loan amount that payment pays off at the rate and term entered, which is arithmetic and not the amount a lender would lend.",
  "The payment has two parts. Principal and interest is what you pay the lender, and it stays the same every month on a fixed-rate loan. Property tax and homeowners insurance are added on top, using the yearly amounts you typed, spread over twelve months.",
  "This calculator assumes a conventional loan. FHA, VA and USDA loans have their own insurance and fees, so their payments will differ from what you see here.",
  "With less than 20% down, a conventional loan usually adds mortgage insurance. If you enter a monthly amount under Add detail, the calculator includes it until your balance is scheduled to reach 78% of the home price, then drops it.",
  "Early in the loan most of each payment is interest. The year-by-year schedule shows how that shifts toward principal over time, and how extra principal shortens the loan.",
];

export const QUESTIONS: { q: string; a: string }[] = [
  {
    q: "Why is my real payment different from this estimate?",
    a: "Tax and insurance here are the amounts you entered. Your actual tax bill and insurance premium can be higher or lower and can change from year to year, and a lender may collect them through an escrow account. The interest rate you are offered also depends on your credit, the property and the loan.",
  },
  {
    q: "How much difference does a larger down payment make?",
    a: "A larger down payment lowers the amount you borrow, which lowers both the monthly payment and the total interest. Reaching 20% down on a conventional loan also avoids mortgage insurance. Change the down payment above to compare.",
  },
  {
    q: "Is a 15-year loan better than a 30-year loan?",
    a: "A shorter loan has a higher monthly payment and much less total interest, because you borrow the money for half as long. A longer loan keeps the payment lower. Switch the loan term above to see both.",
  },
  {
    q: "What does paying extra principal do?",
    a: "Extra principal goes straight to the balance, so less interest builds up afterward and the loan ends sooner. Enter an amount under Add detail to see the interest and time it saves. It does not lower the regular monthly payment.",
  },
];
