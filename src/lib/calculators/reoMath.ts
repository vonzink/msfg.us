/**
 * Projection model for the Investment Property ROI calculator. Pure functions, no DOM.
 * Ported from msfg-calc `legacy/calc-reo/reo-math.js`; keep the two in step.
 *
 * Conventions
 *   - All rates are decimals (0.06 = 6%).
 *   - Renovation is paid in cash at purchase, so it is part of cash invested.
 *   - Property value, loan balance and equity are as of the end of each year.
 *   - Income tax = (NOI − mortgage interest − depreciation) × bracket. A negative result is a
 *     tax saving, which assumes the loss can be used against other income.
 *   - Cap rate = a fully rented year's NOI ÷ that year's property value (not the purchase-time value).
 *   - Tax on a sale (optional, `saleTax`): gain = sale price − selling costs − adjusted basis, where
 *     adjusted basis = price + closing costs + renovation − depreciation taken. "long" taxes the
 *     depreciation part of the gain at the bracket capped at 25% (unrecaptured §1250) and the rest at
 *     `capGainsRate`; "short" taxes the whole gain at the bracket. A loss on sale gets no tax benefit.
 *     State tax and the 3.8% net investment income tax are not modelled.
 *   - Opportunity cost (optional, `altReturn`): the gain from investing the cash invested, as a lump
 *     sum on day one, at that yearly rate with annual compounding.
 */

export const REO_YEARS = 5;

export type AmortType = "pi" | "io" | "cash";
/** How a sale is taxed: not at all, at long-term rates, or at ordinary (short-term) rates. */
export type SaleTaxMode = "none" | "long" | "short";

/** Unrecaptured §1250 gain (depreciation taken) is taxed at the ordinary rate, capped at 25%. */
export const RECAPTURE_RATE_CAP = 0.25;

export type ReoInput = {
  purchasePrice: number;
  downPct: number;
  rate: number;
  termYears: number;
  amortType: AmortType;
  acqCosts: number;
  renoTotal: number;
  renoMonths: number;
  /** 0 = use the purchase price. */
  renoValue: number;
  sellCostPct: number;
  /** Monthly. */
  grossRents: number;
  vacancy: number;
  /** Insurance + HOA: owed every month, including during renovation. */
  carryMonthly: number;
  /** Advertising, travel, landscaping, maintenance, management, other: only while rented. */
  operatingMonthly: number;
  /** Annual, on the purchase price. */
  propTaxRate: number;
  appreciation: number;
  rentIncrease: number;
  expIncrease: number;
  /** Building share of the price; land is not depreciable. */
  improvePct: number;
  taxBracket: number;
  deprYears: number;
  /** Default "none". */
  saleTax?: SaleTaxMode;
  /** Long-term capital gains rate, used when saleTax is "long". */
  capGainsRate?: number;
  /** Yearly return available elsewhere; 0 or omitted turns the comparison off. */
  altReturn?: number;
};

export type ReoResult = {
  loanAmount: number;
  downAmount: number;
  cashInvested: number;
  renoTotal: number;
  renValue: number;
  monthlyPayment: number;
  incomeMonthly: number;
  expensesMonthly: number;
  noiMonthly: number;
  rentToPrice: number;
  depreciableBasis: number;
  annualDepreciation: number;
  propValue: number[];
  grossIncome: number[];
  expenses: number[];
  noi: number[];
  capRate: number[];
  debtService: number[];
  interest: number[];
  principalPaid: number[];
  loanBalance: number[];
  /** NaN when there is no debt service. */
  dcr: number[];
  cashFlow: number[];
  taxableIncome: number[];
  incomeTax: number[];
  afterTaxCashFlow: number[];
  cashOnCash: number[];
  netEquity: number[];
  accumulatedDepreciation: number[];
  /** Taxable gain if sold at year end (negative = loss). */
  gainOnSale: number[];
  /** Tax due on the sale; all zeros when saleTax is "none". */
  saleTax: number[];
  cumAfterTaxCashFlow: number[];
  /** After-tax cash flow to date + net equity − tax on the sale − cash invested. */
  cumulativeReturn: number[];
  roi: number[];
  /** Gain from investing the cash invested at altReturn instead. */
  altGain: number[];
  /** cumulativeReturn − altGain. */
  vsAlt: number[];
};

type Month = { interest: number; principal: number; balance: number };

const num = (x: unknown): number => {
  const v = Number(x);
  return Number.isFinite(v) ? v : 0;
};

const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

/** Level monthly payment (positive number). */
export function levelPayment(principal: number, monthlyRate: number, nper: number): number {
  if (principal <= 0 || nper <= 0) return 0;
  if (monthlyRate === 0) return principal / nper;
  return (principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -nper));
}

/** Month-by-month amortization. */
export function buildSchedule(
  principal: number,
  rateAnnual: number,
  termYears: number,
): { payment: number; months: Month[] } {
  const r = rateAnnual / 12;
  const nper = Math.round(termYears * 12);
  const payment = levelPayment(principal, r, nper);
  const months: Month[] = [];
  let balance = principal;
  for (let m = 1; m <= nper && balance > 0.005; m++) {
    const interest = balance * r;
    const princ = Math.min(balance, payment - interest);
    balance = Math.max(0, balance - princ);
    months.push({ interest, principal: princ, balance });
  }
  return { payment, months };
}

export function projectReo(input: Partial<ReoInput>): ReoResult {
  const price = num(input.purchasePrice);
  const rate = num(input.rate);
  const termYears = num(input.termYears);
  const amortType: AmortType = input.amortType ?? "pi";
  const acqCosts = num(input.acqCosts);
  const reno = num(input.renoTotal);
  const renoMonths = Math.max(0, Math.min(12, Math.round(num(input.renoMonths))));
  const renValue = num(input.renoValue) > 0 ? num(input.renoValue) : price;
  const sellCostPct = num(input.sellCostPct);
  const rents = num(input.grossRents);
  const appreciation = num(input.appreciation);
  const taxBracket = num(input.taxBracket);
  const deprYears = num(input.deprYears);
  const saleTaxMode: SaleTaxMode = input.saleTax ?? "none";
  const capGainsRate = num(input.capGainsRate);
  const altReturn = num(input.altReturn);

  const carryMonthly = num(input.carryMonthly) + (price * num(input.propTaxRate)) / 12;
  const operatingMonthly = num(input.operatingMonthly);
  const incomeMonthly = rents * (1 - num(input.vacancy));
  const expensesMonthly = carryMonthly + operatingMonthly;

  // Financing
  const loanAmount = amortType === "cash" ? 0 : Math.max(0, price * (1 - num(input.downPct)));
  const downAmount = price - loanAmount;
  const schedule =
    loanAmount > 0 && amortType === "pi" && termYears > 0
      ? buildSchedule(loanAmount, rate, termYears)
      : null;

  // Everything paid out of pocket to get the property rent-ready.
  const cashInvested = downAmount + acqCosts + reno;

  // Depreciation: building share of the acquisition cost plus the renovation, straight line.
  const depreciableBasis = (price + acqCosts) * num(input.improvePct) + reno;
  const annualDepreciation = deprYears > 0 ? depreciableBasis / deprYears : 0;

  const out: ReoResult = {
    loanAmount,
    downAmount,
    cashInvested,
    renoTotal: reno,
    renValue,
    monthlyPayment: schedule ? schedule.payment : amortType === "io" ? (loanAmount * rate) / 12 : 0,
    incomeMonthly,
    expensesMonthly,
    noiMonthly: incomeMonthly - expensesMonthly,
    rentToPrice: price > 0 ? rents / price : 0,
    depreciableBasis,
    annualDepreciation,
    propValue: [], grossIncome: [], expenses: [], noi: [], capRate: [],
    debtService: [], interest: [], principalPaid: [], loanBalance: [], dcr: [],
    cashFlow: [], taxableIncome: [], incomeTax: [], afterTaxCashFlow: [], cashOnCash: [],
    netEquity: [], accumulatedDepreciation: [], gainOnSale: [], saleTax: [],
    cumAfterTaxCashFlow: [], cumulativeReturn: [], roi: [], altGain: [], vsAlt: [],
  };

  let value = renValue;
  let cumAT = 0;

  for (let i = 0; i < REO_YEARS; i++) {
    const year = i + 1;
    const monthsRented = year === 1 ? 12 - renoMonths : 12;

    // Operations. Taxes, insurance and HOA are owed for all 12 months even while renovating.
    const gi = incomeMonthly * monthsRented * Math.pow(1 + num(input.rentIncrease), i);
    const ex =
      (carryMonthly * 12 + operatingMonthly * monthsRented) * Math.pow(1 + num(input.expIncrease), i);
    const noi = gi - ex;
    // A full, fully rented year at this year's rents and costs: the basis for the cap rate,
    // so renovation months in year 1 do not understate it.
    const stabilizedNoi =
      incomeMonthly * 12 * Math.pow(1 + num(input.rentIncrease), i) -
      expensesMonthly * 12 * Math.pow(1 + num(input.expIncrease), i);

    // Debt
    let interest = 0;
    let principalPaid = 0;
    let balance = loanAmount;
    if (loanAmount > 0 && amortType === "io") {
      interest = loanAmount * rate;
    } else if (schedule) {
      const months = schedule.months.slice(i * 12, i * 12 + 12);
      interest = sum(months.map((m) => m.interest));
      principalPaid = sum(months.map((m) => m.principal));
      const last = schedule.months[Math.min(schedule.months.length, year * 12) - 1];
      balance = last ? last.balance : loanAmount;
    }
    const ds = interest + principalPaid;

    // Cash flow before and after income tax
    const cf = noi - ds;
    const taxable = noi - interest - annualDepreciation;
    const tax = taxable * taxBracket;
    const at = cf - tax;
    cumAT += at;

    // Position if sold at the end of the year
    value *= 1 + appreciation;
    const realized = value * (1 - sellCostPct);
    const equity = realized - balance;

    // Tax on that sale
    const accDep = Math.min(depreciableBasis, annualDepreciation * year);
    const gain = realized - (price + acqCosts + reno - accDep);
    let saleTax = 0;
    if (gain > 0 && saleTaxMode === "short") {
      saleTax = gain * taxBracket;
    } else if (gain > 0 && saleTaxMode === "long") {
      const recapture = Math.min(accDep, gain);
      saleTax = recapture * Math.min(taxBracket, RECAPTURE_RATE_CAP) + (gain - recapture) * capGainsRate;
    }

    const totalReturn = cumAT + equity - saleTax - cashInvested;
    const altGain = cashInvested * (Math.pow(1 + altReturn, year) - 1);

    out.propValue.push(value);
    out.grossIncome.push(gi);
    out.expenses.push(ex);
    out.noi.push(noi);
    out.capRate.push(value > 0 ? stabilizedNoi / value : 0);
    out.debtService.push(ds);
    out.interest.push(interest);
    out.principalPaid.push(principalPaid);
    out.loanBalance.push(balance);
    out.dcr.push(ds > 0 ? noi / ds : NaN);
    out.cashFlow.push(cf);
    out.taxableIncome.push(taxable);
    out.incomeTax.push(tax);
    out.afterTaxCashFlow.push(at);
    out.cashOnCash.push(cashInvested > 0 ? cf / cashInvested : 0);
    out.netEquity.push(equity);
    out.accumulatedDepreciation.push(accDep);
    out.gainOnSale.push(gain);
    out.saleTax.push(saleTax);
    out.altGain.push(altGain);
    out.vsAlt.push(totalReturn - altGain);
    out.cumAfterTaxCashFlow.push(cumAT);
    out.cumulativeReturn.push(totalReturn);
    out.roi.push(cashInvested > 0 ? totalReturn / cashInvested : 0);
  }

  return out;
}
