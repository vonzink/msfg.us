/**
 * The words around the Home budget calculator. Drafted for review by the compliance sign-off.
 * Rules: plain language, no formulas, results are estimates, and nothing that reads as a loan
 * decision, a rate offer or advice. The two ratios are described as shares of income and read in
 * three words: Comfortable, Stretching, High. The band edges written here are checked against the
 * model's own in `content.test.ts`.
 */
export const INTRO =
  "This page adds up a month of income, tax, housing, debts and living costs to show what is left, as a way to look at your own numbers and not as a loan decision.";

export const HOW_IT_WORKS: string[] = [
  "Enter a month of income and costs. The page shows what is left at the end of the month, and how much of the income goes to housing and to debts.",
  "The two ratios are shares of gross income, which is income before tax. The first is the housing payment on its own. The second is the housing payment and the debt payments together. Living costs are not in either one.",
  "Left after housing and debts is gross income less those two payments. Tax, savings and living costs have not been taken off at that point, so it is not spending money.",
  "Monthly cash flow is what remains after everything entered: tax, any savings set aside, housing, debts and living costs. When the costs come to more than the income, the page says how far the month falls short.",
  "Each share is read in three bands. For housing, up to 32% of gross income reads as Comfortable, above 32% and up to 47% as Stretching, and above 47% as High. For housing and debts together, the bands change at 47% and 55%. The bands are a general way to read a share of income. They are not a rule, and lenders look at more than these two ratios.",
  "Housing, debts and living costs can each be typed as one total or itemized line by line under Add detail. A group uses its total or its lines, never both. The total you typed is kept while the lines are in use, and it comes back when you switch back.",
  "Savings are optional. A share of income set aside is taken off before the bills. Account balances are only used to show how many whole months of the housing payment they would cover.",
  "Your numbers stay in this browser. They are not saved or sent anywhere. The result is an estimate based on what you entered.",
];

export const QUESTIONS: { q: string; a: string }[] = [
  {
    q: "Do I enter gross income or take-home pay?",
    a: "Gross income, before tax. The two ratios are shares of gross income, and the estimated tax rate then takes the tax off, so the cash flow is worked out on what is left after tax. If you only know your take-home pay, you can enter it as the income with a tax rate of 0. The cash flow will still add up, but the two ratios will read higher than they would on gross income.",
  },
  {
    q: "What counts as a debt payment?",
    a: "Payments you owe each month on money you have borrowed: car loans, student loans, personal loans and the minimum payment on credit cards. The mortgage or rent goes under housing, not here. Bills such as utilities, phone, groceries and insurance are living costs.",
  },
  {
    q: "What if the ratios are high?",
    a: "A high share means more of the income is already spoken for, which leaves less room for a surprise cost. It is not a decision on a loan. Lenders look at credit, savings, the down payment and the type of loan as well as these ratios. A loan officer can go through your own numbers with you.",
  },
  {
    q: "How many months of savings is enough?",
    a: "There is no single answer. The figure here is how many whole months of the housing payment your balances would cover if no income came in. Some loans ask for a set number of months in reserve, and the number depends on the loan. A loan officer can tell you what applies to yours.",
  },
];
