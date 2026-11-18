/**
 * Payment and amortization model for the Mortgage calculator. Pure functions, no DOM.
 * Ported from msfg-calc `public/js/shared/amortization-math.js` (purchase, conventional only).
 * `golden.json` holds cases recorded from that code by `scripts/calculators/golden-mortgage.mjs`
 * and `math.test.ts` requires this file to reproduce them, so the public site and the dashboard
 * give the same numbers. When the dashboard math changes, rerun the script and read the diff.
 *
 * Conventions
 *   - Rates are decimals (0.07 = 7%). Money is in dollars.
 *   - A conventional loan is assumed. FHA, VA and USDA insurance and fees are not modelled.
 *   - The loan amount is the home price minus the down payment. Nothing is financed on top.
 *   - Every scheduled row is rounded to cents, as a servicer would. The last payment absorbs the
 *     rounding and is capped at the payoff, so the balance always ends at exactly zero.
 *   - Mortgage insurance (PMI) is the monthly amount the visitor typed. It is charged only when
 *     the loan starts above 80% of the price, and it stops at the payment where the originally
 *     scheduled balance reaches 78% of the price, or after the loan's midpoint, whichever is first.
 *     Extra payments do not end it sooner.
 *   - Extra principal starts with the first payment: every month, once a year on that anniversary,
 *     or once. It is capped at the balance left.
 *   - Tax and insurance are the yearly amounts typed in, spread evenly over twelve months. They do
 *     not rise over time.
 */
import { monthlyPayment, roundCents } from "@/lib/finance";

export type ExtraFrequency = "monthly" | "annually" | "one-time";

export type MortgageInput = {
  homePrice: number;
  downPayment: number;
  annualRate: number;
  /** Whole years, 1 to 40. */
  termYears: number;
  yearlyTax: number;
  yearlyInsurance: number;
  monthlyHoa: number;
  monthlyPmi: number;
  extraAmount: number;
  extraFrequency: ExtraFrequency;
  /** Month of the first payment, 0 (January) to 11. */
  startMonth: number;
  startYear: number;
};

export type ScheduleRow = {
  paymentNum: number;
  month: number;
  year: number;
  principal: number;
  interest: number;
  extra: number;
  /** Balance after this payment. */
  balance: number;
  pmi: number;
  /** Everything paid this month: principal, interest, extra, tax, insurance, HOA and PMI. */
  totalMonthly: number;
};

/** One year of the loan, counted from the first payment (year 1 is payments 1 to 12). */
export type YearRow = {
  year: number;
  principal: number;
  interest: number;
  extra: number;
  pmi: number;
  /** Everything paid that year, including tax, insurance, HOA and PMI. */
  paid: number;
  endBalance: number;
};

export type MortgageResult = {
  loanAmount: number;
  /** Loan amount as a percent of the price at the start. */
  ltv: number;
  /** Scheduled principal and interest. */
  monthlyPI: number;
  /**
   * The regular first payment, without any extra principal. The dashboard's headline adds the
   * first month's extra to this figure; the public page keeps the regular payment as the headline
   * and states the extra beside it, so a one-time lump sum never reads as a monthly payment.
   */
  first: { principalAndInterest: number; tax: number; insurance: number; hoa: number; pmi: number; total: number };
  /** The extra principal as entered. `amount` is 0 when there is none. */
  extra: { amount: number; frequency: ExtraFrequency };
  schedule: ScheduleRow[];
  years: YearRow[];
  totalInterest: number;
  /** Every dollar paid over the life of the loan, including tax, insurance, HOA and PMI. */
  totalCost: number;
  /** Interest avoided by the extra principal. Zero without any. */
  interestSaved: number;
  monthsSaved: number;
  /** PMI, when it applies, is charged on payments before this one. */
  pmiEndPayment: number;
  payoff: { month: number; year: number };
};

/** Junk or negative optional amounts count as zero. */
const amount = (x: number): number => (Number.isFinite(x) && x > 0 ? x : 0);

const sum = (rows: ScheduleRow[], key: "interest" | "totalMonthly"): number =>
  roundCents(rows.reduce((total, row) => total + row[key], 0));

/** null when the dashboard would reject the inputs. */
export function calculateMortgage(input: MortgageInput): MortgageResult | null {
  const { homePrice, annualRate, termYears } = input;
  const loanAmount = roundCents(homePrice - input.downPayment);
  if (
    !Number.isFinite(loanAmount) || loanAmount <= 0 || !(homePrice > 0) || input.downPayment < 0 ||
    !Number.isFinite(annualRate) || annualRate < 0 || annualRate > 0.25 ||
    !Number.isInteger(termYears) || termYears < 1 || termYears > 40
  ) return null;

  const months = termYears * 12;
  const ltv = (loanAmount / homePrice) * 100;
  const monthlyPI = roundCents(monthlyPayment(loanAmount, annualRate * 100, months));
  const tax = roundCents(amount(input.yearlyTax) / 12);
  const insurance = roundCents(amount(input.yearlyInsurance) / 12);
  const hoa = roundCents(amount(input.monthlyHoa));
  const pmiAmount = roundCents(amount(input.monthlyPmi));
  const extraAmount = roundCents(amount(input.extraAmount));
  const startMonth = Number.isFinite(input.startMonth) ? input.startMonth : 0;
  const startYear = Number.isFinite(input.startYear) ? input.startYear : 0;

  const build = (withExtras: boolean): ScheduleRow[] => {
    const rows: ScheduleRow[] = [];
    let balance = loanAmount;
    for (let index = 0; index < months && balance > 0; index++) {
      const interest = roundCents((balance * annualRate) / 12);
      const principal = index === months - 1 ? balance : Math.min(balance, Math.max(0, roundCents(monthlyPI - interest)));
      const due =
        input.extraFrequency === "monthly" ||
        (input.extraFrequency === "annually" && index % 12 === 0) ||
        (input.extraFrequency === "one-time" && index === 0);
      const extra = withExtras && due ? Math.min(extraAmount, roundCents(balance - principal)) : 0;
      balance = Math.max(0, roundCents(balance - principal - extra));
      rows.push({
        paymentNum: index + 1,
        month: (startMonth + index) % 12,
        year: startYear + Math.floor((startMonth + index) / 12),
        principal, interest, extra, balance,
        pmi: 0,
        totalMonthly: 0,
      });
    }
    return rows;
  };

  const base = build(false);
  const schedule = build(true);

  const cutoff = base.find((row) => row.balance <= homePrice * 0.78);
  const pmiEndPayment = Math.min(cutoff ? cutoff.paymentNum : base.length, termYears * 6 + 1);
  for (const rows of [base, schedule]) {
    for (const row of rows) {
      if (ltv > 80 && row.paymentNum < pmiEndPayment) row.pmi = pmiAmount;
      row.totalMonthly = roundCents(roundCents(row.principal + row.interest + row.extra) + tax + insurance + hoa + row.pmi);
    }
  }

  const years: YearRow[] = [];
  schedule.forEach((row, index) => {
    const y = Math.floor(index / 12);
    years[y] ??= { year: y + 1, principal: 0, interest: 0, extra: 0, pmi: 0, paid: 0, endBalance: 0 };
    years[y].principal = roundCents(years[y].principal + row.principal);
    years[y].interest = roundCents(years[y].interest + row.interest);
    years[y].extra = roundCents(years[y].extra + row.extra);
    years[y].pmi = roundCents(years[y].pmi + row.pmi);
    years[y].paid = roundCents(years[y].paid + row.totalMonthly);
    years[y].endBalance = row.balance;
  });

  const firstPmi = schedule[0].pmi;
  const last = schedule[schedule.length - 1];
  return {
    loanAmount, ltv, monthlyPI,
    first: {
      principalAndInterest: monthlyPI, tax, insurance, hoa, pmi: firstPmi,
      total: roundCents(monthlyPI + tax + insurance + hoa + firstPmi),
    },
    extra: { amount: extraAmount, frequency: input.extraFrequency },
    schedule, years,
    totalInterest: sum(schedule, "interest"),
    totalCost: sum(schedule, "totalMonthly"),
    interestSaved: roundCents(sum(base, "interest") - sum(schedule, "interest")),
    monthsSaved: base.length - schedule.length,
    pmiEndPayment,
    payoff: { month: last.month, year: last.year },
  };
}

export type PaymentPart = { key: "principal" | "interest" | "tax" | "insurance" | "hoa" | "pmi" | "extra"; label: string; value: number };

export type PaymentBreakdown = {
  paymentNum: number;
  /** Year of the loan this payment falls in, counted from the first payment. */
  loanYear: number;
  month: number;
  year: number;
  parts: PaymentPart[];
  total: number;
  /** Balance after this payment. */
  balance: number;
  /** Principal and interest as shares of the two together, 0 to 1. Extra principal is not counted. */
  principalShare: number;
  interestShare: number;
};

/**
 * One payment split into its parts, for the slider that walks through the loan. A payment number
 * outside the schedule is pulled to the nearest end.
 */
export function paymentBreakdown(r: MortgageResult, paymentNum: number): PaymentBreakdown | null {
  if (r.schedule.length === 0) return null;
  const n = Math.min(r.schedule.length, Math.max(1, Math.round(Number.isFinite(paymentNum) ? paymentNum : 1)));
  const row = r.schedule[n - 1];
  const both = row.principal + row.interest;
  return {
    paymentNum: n,
    loanYear: Math.floor((n - 1) / 12) + 1,
    month: row.month,
    year: row.year,
    parts: [
      { key: "principal", label: "Principal", value: row.principal },
      { key: "interest", label: "Interest", value: row.interest },
      { key: "tax", label: "Property tax", value: r.first.tax },
      { key: "insurance", label: "Homeowners insurance", value: r.first.insurance },
      { key: "hoa", label: "HOA dues", value: r.first.hoa },
      { key: "pmi", label: "Mortgage insurance", value: row.pmi },
      { key: "extra", label: "Extra principal", value: row.extra },
    ],
    total: row.totalMonthly,
    balance: row.balance,
    principalShare: both > 0 ? row.principal / both : 0,
    interestShare: both > 0 ? row.interest / both : 0,
  };
}
