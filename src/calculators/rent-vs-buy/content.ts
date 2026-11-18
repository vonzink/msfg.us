/**
 * The words around the Rent vs buy calculator. Drafted for review by the compliance sign-off.
 * Rules: plain language, no formulas, results are estimates, no forecast of home prices, and
 * nothing that reads as a recommendation to buy or to rent, a rate offer or a loan decision.
 */
export const HOW_IT_WORKS: string[] = [
  "Each path is added up over the years you plan to stay. The path with the lower net cost at the end is the one that comes out ahead on these numbers.",
  "Buying counts the down payment, the mortgage payments, property tax, homeowners insurance and maintenance. Then it takes off what you would walk away with after selling: the home's value, less the loan balance and the selling costs.",
  "Renting counts the rent, which changes each year by the amount you set. Then it takes off what the down payment could have earned if it had been invested instead.",
  "Buying usually starts behind, because selling a home costs money and little of the loan is paid off in the early years. It catches up as the loan is paid down and as the home's value changes.",
  "The loan is a fixed-rate loan, and the payment shown is principal and interest. Not included: mortgage insurance, closing costs on the purchase, HOA dues, renters insurance and income tax effects. The page also does not invest any monthly difference between the two paths. Only the down payment is treated as invested on the renting side.",
  "The result is an estimate. It depends on the assumptions listed under the result, and you can change each one under Add detail.",
];

export const QUESTIONS: { q: string; a: string }[] = [
  {
    q: "Why do the early years favor renting?",
    a: "A buyer pays selling costs when the home is sold. In the first years most of each mortgage payment goes to interest, so the loan balance falls slowly. Over a short stay there is little equity to set against those costs. Over a longer stay the balance is lower and the home's value has had more time to change.",
  },
  {
    q: "What do I put for how much the home's value rises?",
    a: "No one knows what home values will do, and this page does not predict it. The starting figure is only a placeholder. Try a lower figure and a higher one, including zero, to see how far the result moves.",
  },
  {
    q: "Why does the result change so much with the number of years?",
    a: "Selling costs are paid once, while rent is paid every month. Over a short stay that one cost weighs heavily. Over a long stay it is spread across many years, and the yearly assumptions have more time to add up.",
  },
  {
    q: "What would mortgage insurance change?",
    a: "With less than 20% down, most loans add mortgage insurance to the monthly payment. It is not included here, so the cost of buying would be higher than shown for as long as it is charged. A loan officer can give you the figure for your loan.",
  },
];
