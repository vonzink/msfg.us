/**
 * The words around the Investment calculator. Drafted for review by the compliance sign-off.
 * Rules: plain language, no formulas, results are estimates, and nothing that reads as tax or
 * investment advice, a rate offer or a loan decision.
 */
/** The sentence under the heading. */
export const INTRO = "Enter the deal and your cash flow, tax effect, equity and five-year return update as you type.";

export const HOW_IT_WORKS: string[] = [
  "The page adds up the rent the property brings in and sets it against the costs of owning and running it, such as property tax, insurance, upkeep, management and time spent empty. If there is a loan, the mortgage payments are counted too.",
  "The five-year return counts the cash flow, the effect on income tax, and the equity that comes from paying down the loan and from the change in the property's value. Selling costs are taken off, and so is an estimate of the tax on the sale unless that is switched to \"Leave out\". The return is measured against the cash you put in.",
  "Growth in value, rent and expenses, income tax, and the comparison with another investment are assumptions. They are under Add detail, and the figures in it count whether or not you open it.",
  "The figures are estimates based on the numbers you entered. They are not tax or investment advice.",
];

export const QUESTIONS: { q: string; a: string }[] = [
  {
    q: "What do cash-on-cash and cap rate mean?",
    a: "Cash-on-cash is the first year's cash flow, before income tax, as a share of the cash you put in. It leaves out appreciation and loan paydown. Cap rate is a full rented year of net operating income as a share of the purchase price. It describes the property itself and leaves out the loan.",
  },
  {
    q: "Why can year 1 look worse than later years?",
    a: "Closing costs and renovation are paid at the start. While the property is being renovated there is no rent, but property tax, insurance and HOA dues still count. Selling costs also weigh more against a short stretch of ownership. Later years have rent for all twelve months.",
  },
  {
    q: 'What does "No, hold them" mean?',
    a: "It is one of the two answers to the question about deducting rental losses from your other income, under Add detail, in Income taxes. With it, a loss on the rental saves no tax that year. The loss is held, set against later rental profit first, and whatever is left is used when you sell. What is left at the sale is counted only when tax on the sale is counted. Which answer fits you is a question for your tax advisor.",
  },
];
