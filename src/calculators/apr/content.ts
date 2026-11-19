/**
 * The words around the APR calculator. Drafted for review by the compliance sign-off.
 * Rules: plain language, no formulas, the result is an estimate worked out from the numbers typed
 * on the page, and nothing that reads as a loan decision, a rate on the table or advice. The 78%
 * and the 15 days written here are checked against the model's own in `content.test.ts`.
 * There is no intro: the heading asks the question and the page opens on a worked example.
 */
export const HOW_IT_WORKS: string[] = [
  "The interest rate sets the monthly payment. The APR starts from the same loan and spreads certain up-front costs over its life, as if they were interest. That is why the APR is at or above the interest rate, and why it does not change the payment.",
  "The costs counted here are the lender fees you enter, any discount points, prepaid interest and mortgage insurance. Costs paid to others that are not charges for the loan itself, such as the appraisal, title work and recording, are left out, so leave them out of the lender fees.",
  "The loan is assumed to be a conventional fixed-rate loan with the same payment every month.",
  "Mortgage insurance is counted when you enter a monthly amount and the home value. It is counted until the scheduled balance reaches 78% of the home value. A loan that starts at or under 78% has none counted.",
  "Prepaid interest is the interest from the closing date to the end of that month. When the box is left empty the page uses 15 days of interest, and the amount is shown in the list of fees.",
  "A lender credit lowers the lender fees and prepaid interest that are counted, never below zero. It does not come off discount points.",
  "The result is an estimate based on the numbers you entered. The official APR is the one on your Loan Estimate.",
];

export const QUESTIONS: { q: string; a: string }[] = [
  {
    q: "Why is the APR higher than the interest rate?",
    a: "The interest rate is the cost of borrowing the money. The APR also counts certain fees paid to get the loan, and mortgage insurance when there is any, spread over the life of the loan. With no fees counted, the two are the same.",
  },
  {
    q: "Is a lower APR always the better loan?",
    a: "Not always. APR spreads the up-front costs over the whole term, so it assumes the loan is kept to the end. A loan with more points can show a lower APR and still cost more for someone who sells or refinances after a few years. APR is one way to compare loans, alongside the monthly payment and the cash needed at closing.",
  },
  {
    q: "What is a Loan Estimate?",
    a: "A Loan Estimate is a three-page form a lender sends within three business days of receiving a loan application. It lists the interest rate, the monthly payment, the closing costs and the APR for that loan. The APR on it is the official figure.",
  },
  {
    q: "Why can the APR here differ from a lender's?",
    a: "This page counts one total of lender fees, and a lender works through every fee one by one under federal rules. The closing date changes the prepaid interest, and loans other than conventional fixed-rate loans have costs this page does not model. This figure is an estimate, and the Loan Estimate has the official one.",
  },
];
