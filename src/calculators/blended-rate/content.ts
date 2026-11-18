/**
 * The words around the Blended rate calculator. Drafted for review by the compliance sign-off.
 * Rules: plain language, no formulas, results are estimates, and nothing that reads as a loan
 * decision, a rate offer or a recommendation to refinance.
 */
export const HOW_IT_WORKS: string[] = [
  "When you owe on more than one loan, each has its own rate. The blended rate is the single rate they add up to, with each debt counted according to how much you owe on it.",
  "Size matters more than you might expect. A large mortgage at a low rate pulls the blended rate down a long way, and a small balance at a high rate nudges it up only a little. The bar above shows how much of the total each debt makes up.",
  "The blended rate is useful when you are looking at replacing several debts with one loan. It gives you one number to hold against the new loan's rate.",
  "It does not tell you which choice costs less. That also depends on how long each debt has left and how long the new loan would run. A lower rate over many more years can still mean more interest in total.",
];

export const QUESTIONS: { q: string; a: string }[] = [
  {
    q: "Why is my blended rate so close to my mortgage rate?",
    a: "Because the mortgage is most of what you owe. Each debt counts in proportion to its balance, so the biggest balance sets most of the result.",
  },
  {
    q: "If one new loan has a lower rate than my blended rate, should I combine everything?",
    a: "Not on the rate alone. Rolling a car loan or a credit card into a 30-year mortgage can lower the rate and the monthly payment while raising the total interest, because you pay it for far longer. Closing costs count too. A loan officer can lay the two side by side.",
  },
  {
    q: "Which debts should I include?",
    a: "Include the ones you are thinking of replacing or paying off with a new loan. Leave out anything that would stay as it is.",
  },
  {
    q: "Do I need to enter the monthly payments?",
    a: "No. Payments do not change the blended rate. Add them under Add detail if you want to see what you pay each month in total.",
  },
];
