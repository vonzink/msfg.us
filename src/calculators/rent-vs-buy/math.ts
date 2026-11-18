/**
 * Model for the Rent vs buy calculator. Pure functions, no DOM.
 * Ported from msfg-calc `public/js/calculators/buy-vs-rent.js`, function calculate().
 * `golden.json` holds cases recorded from that page's own code by
 * `scripts/calculators/golden-rent-vs-buy.mjs` and `math.test.ts` requires this file to
 * reproduce them to the cent.
 *
 * What is compared, over the years the visitor plans to stay
 *   - Buying: the down payment, the closing costs on the purchase, the mortgage payments
 *     (principal and interest), property tax, homeowners insurance, mortgage insurance, HOA dues
 *     and maintenance, added up. That is the total paid. Then the income tax saved on the mortgage
 *     interest is taken off, when a tax rate was entered, and the home is sold: what is left
 *     after paying off the loan and the selling costs (the equity) is taken off. That is the net
 *     cost of buying.
 *   - Renting: the rent, added up, minus what the down payment would have earned if it had been
 *     invested instead. That is the net cost of renting.
 *   - The difference is renting's net cost minus buying's. Positive means buying is ahead.
 *
 * Conventions
 *   - Rates are decimals (0.07 = 7%). The loan term is whole months. The stay is whole years.
 *   - Closing costs, property tax, homeowners insurance and maintenance must each be entered. NaN
 *     means "not entered" and gives no result, so a comparison is never shown with a cost silently
 *     left out. A 0 is an entry. A negative amount counts as zero.
 *   - Mortgage insurance, HOA dues and the income tax rate are optional: 0 means none. NaN means
 *     the box held something unreadable and gives no result. Negative amounts count as zero.
 *   - Property tax in year y (counting from 0) is `yearlyTax x (1 + appreciation)^y`: it follows
 *     the home's value.
 *   - Insurance and maintenance in year y are multiplied by `(1 + COST_INFLATION)^y`. The
 *     dashboard has a field for this that defaults to 0; here it is fixed at 3% and stated on
 *     the page.
 *   - Rent paid is twelve months at each year's rent; the rent rises after each year.
 *   - Equity is `sale price - loan balance - sale price x selling costs`, with the sale price
 *     `price x (1 + appreciation)^years`. It can be negative.
 *   - The renter's side is `down x (1 + return)^years - down`, compounded yearly.
 *   - Sums are kept unrounded, as on the dashboard. Each reported figure is rounded to cents on
 *     its own, so a total can differ by a cent from its rounded parts added up. The difference
 *     is taken from the unrounded net costs and then rounded; "even" is a difference of zero to
 *     the cent (the dashboard words a tie as renting ahead).
 *   - The year-by-year path is this same calculation run for each year: "if you sold and stopped
 *     at the end of year N". The year buying pulls ahead is looked for up to MAX_YEARS, also
 *     past the stay.
 *
 * Added to the ported model. With all of these at 0 the model is the ported one, and the golden
 * cases are run that way.
 *   - Mortgage insurance is the monthly amount typed, by the Mortgage calculator's rule
 *     (`mortgage/math.ts`, kept in step by hand since calculators do not import each other): it
 *     is charged only when the loan starts above 80% of the price, on every payment before the
 *     first one at which the scheduled balance is at or below 78% of the price, and never past the
 *     loan's midpoint: payment numbers below `min(cutoff, termMonths / 2 + 1)`. It does not rise.
 *     Here the scheduled balance is the unrounded closed form (`remainingBalance`); the Mortgage
 *     calculator rounds each row to cents, so the two could differ by one payment when a balance
 *     lands within a cent of the 78% line.
 *   - HOA dues are a monthly amount, twelve a year, multiplied by `(1 + COST_INFLATION)^y` like
 *     insurance and maintenance.
 *   - The mortgage interest deduction. Interest paid in a year is that year's payments minus the
 *     fall in the scheduled balance; it stops when the payments stop. The tax saved is
 *     `incomeTaxRate x interest`, summed over the years and taken off the cost of buying in every
 *     year of the path. It counts mortgage interest only (not property tax, not mortgage
 *     insurance), assumes the visitor itemizes and that all of the interest is deductible, and
 *     ignores the standard deduction and any cap. The page says so. A rate of 0 is "off".
 *   - The monthly payment to own (`firstMonth`) is what the first month costs: principal and
 *     interest, a twelfth of the yearly tax and insurance, mortgage insurance when it is charged
 *     on payment 1, and HOA dues. Maintenance is not in it.
 *
 * The two deliberate differences from the dashboard
 *   - Closing costs on the purchase. The dashboard has no such field. Here they are one amount,
 *     paid once at the start and added to the total paid, so they count in every year of the
 *     path and in the year buying pulls ahead. Nothing changes on the renting side: only the down
 *     payment is treated as invested, not the closing costs the renter did not pay. With closing
 *     costs of 0 the model is the dashboard's, and the golden cases are run that way.
 *   - Mortgage payments stop when the loan ends: `min(years x 12, termMonths)` payments are
 *     counted. The dashboard charges `payment x 12` for every year of the analysis, so a 15-year
 *     loan over 20 years is charged 20 years of payments there. The two agree whenever the stay
 *     is no longer than the term, which every golden case keeps to; the longer stay is
 *     hand-checked in the tests.
 *
 * Not modelled, and said so on the page
 *   - Renters insurance, and income tax effects other than the optional interest deduction.
 *   - Investing any monthly difference between the two paths: as on the dashboard, the renter's
 *     side grows only the down payment.
 *   - The loan is a fixed-rate loan with no extra payments.
 */
import { monthlyPayment, remainingBalance, roundCents } from "@/lib/finance";

/** Insurance and maintenance rise by this much a year. A fixed assumption, stated on the page. */
export const COST_INFLATION = 0.03;
/** The longest stay, and how far ahead the model looks for the year buying pulls ahead. */
export const MAX_YEARS = 40;
/** The interest rate runs from 0 up to, but not including, this. */
export const RATE_LIMIT = 0.3;
/** Allowed range, ends included, of the home value, rent and investment return assumptions. */
export const ASSUMPTION_RANGE = { low: -0.2, high: 0.3 };
/** Allowed range, ends included, of the selling costs. */
export const SELLING_COSTS_RANGE = { low: 0, high: 0.2 };
/** Allowed range, ends included, of the income tax rate for the interest deduction. 0 is off. */
export const INCOME_TAX_RANGE = { low: 0, high: 0.5 };
/** Mortgage insurance is charged only when the loan starts above this share of the price. */
const MI_STARTS_ABOVE = 0.8;
/** It stops at the first payment at which the scheduled balance is at or below this share. */
const MI_ENDS_AT = 0.78;

export type RentVsBuyInput = {
  monthlyRent: number;
  homePrice: number;
  /** Dollars. */
  downPayment: number;
  rate: number;
  /** Whole years, 1 to MAX_YEARS. */
  stayYears: number;
  termMonths: number;
  /** The buyer's costs on the purchase, as one total, paid once at the start. */
  closingCosts: number;
  yearlyTax: number;
  yearlyInsurance: number;
  /** Monthly dollars. 0 is none. Ignored when the down payment is 20% or more. */
  monthlyMi: number;
  /** Monthly dollars in the first year. 0 is none. */
  monthlyHoa: number;
  yearlyMaintenance: number;
  /** For the mortgage interest deduction. 0 is off. */
  incomeTaxRate: number;
  appreciation: number;
  rentIncrease: number;
  sellingCosts: number;
  investmentReturn: number;
};

export type YearPoint = {
  year: number;
  netCostBuying: number;
  netCostRenting: number;
  /** Renting's net cost minus buying's. Positive means buying is ahead. */
  difference: number;
};

export type RentVsBuyResult = {
  loanAmount: number;
  /** Principal and interest. */
  monthlyPayment: number;
  /** What the first month of owning costs, part by part. Maintenance is not in it. */
  firstMonth: {
    principalAndInterest: number;
    /** A twelfth of the first year's property tax. */
    tax: number;
    /** A twelfth of the first year's homeowners insurance. */
    insurance: number;
    /** 0 unless mortgage insurance is charged on the first payment. */
    mi: number;
    hoa: number;
    /** The five parts added up, before rounding, then rounded. */
    total: number;
  };
  /** The first payment with no mortgage insurance on it. null when none is charged at all. */
  miEndPayment: number | null;
  /** How many payments within the stay carry mortgage insurance. */
  miMonthsInStay: number;
  buying: {
    downPayment: number;
    closingCosts: number;
    mortgagePayments: number;
    propertyTax: number;
    insurance: number;
    mortgageInsurance: number;
    hoa: number;
    maintenance: number;
    /** The eight lines above added up. */
    totalPaid: number;
    /** Mortgage interest within the stay: the payments minus the fall in the balance. */
    interestPaid: number;
    /** incomeTaxRate x interestPaid. 0 when the rate is 0. */
    taxSavedOnInterest: number;
    homeValue: number;
    loanBalance: number;
    sellingCosts: number;
    /** Home value minus loan balance minus selling costs. Can be negative. */
    equity: number;
    /** totalPaid minus taxSavedOnInterest minus equity. */
    netCost: number;
  };
  renting: {
    rentPaid: number;
    /** Monthly rent in the last year of the stay. */
    lastMonthlyRent: number;
    downPaymentGrowth: number;
    /** rentPaid minus downPaymentGrowth. */
    netCost: number;
  };
  /** At the end of the stay: renting's net cost minus buying's, rounded to cents. */
  difference: number;
  ahead: "buying" | "renting" | "even";
  /** Years 1 to stayYears. */
  years: YearPoint[];
  /** First year, 1 to MAX_YEARS, in which buying is ahead. null when it never is. */
  pullAheadYear: number | null;
};

/** A negative cost counts as zero. One that was not entered (NaN) never gets this far. */
const amount = (x: number): number => (Number.isFinite(x) && x > 0 ? x : 0);
const within = (x: number, low: number, high: number): boolean => Number.isFinite(x) && x >= low && x <= high;
/** The finance helpers take a percent; drop the float noise of 0.07 * 100. */
const percent = (rate: number): number => Number((rate * 100).toFixed(6));
/**
 * Whole cents the way the dashboard displays them: a negative figure is rounded like its positive
 * twin, and a figure that rounds to nothing is 0, never -0.
 */
const cents = (x: number): number => (x < 0 ? -roundCents(-x) : roundCents(x)) + 0;

/**
 * null when there is nothing to compare: rent or price not above zero; down payment NaN, negative
 * or above the price; rate NaN, negative or RATE_LIMIT and above; stay not a whole number from 1 to
 * MAX_YEARS; term not above zero; closing costs, tax, insurance or maintenance NaN (not entered); any of the four
 * assumption rates NaN; appreciation, rent increase or investment return outside ASSUMPTION_RANGE;
 * selling costs outside SELLING_COSTS_RANGE.
 * Also null when mortgage insurance or HOA dues is NaN (unreadable), or the income tax rate is NaN
 * or outside INCOME_TAX_RANGE.
 * Negative closing costs, tax, insurance, mortgage insurance, HOA dues and maintenance count as zero.
 */

/** True when the loan starts above 80% of the price: the case in which mortgage insurance is charged. */
export const mortgageInsuranceApplies = (input: Pick<RentVsBuyInput, "homePrice" | "downPayment">): boolean =>
  input.homePrice - input.downPayment > input.homePrice * MI_STARTS_ABOVE;

export function calculateRentVsBuy(input: RentVsBuyInput): RentVsBuyResult | null {
  const { monthlyRent, homePrice, downPayment, rate, stayYears, termMonths, appreciation, rentIncrease, sellingCosts, investmentReturn } = input;
  if (
    !Number.isFinite(monthlyRent) || monthlyRent <= 0 ||
    !Number.isFinite(homePrice) || homePrice <= 0 ||
    !within(downPayment, 0, homePrice) ||
    !Number.isFinite(rate) || rate < 0 || rate >= RATE_LIMIT ||
    !Number.isInteger(stayYears) || stayYears < 1 || stayYears > MAX_YEARS ||
    !Number.isFinite(termMonths) || termMonths <= 0 ||
    Number.isNaN(input.closingCosts) || Number.isNaN(input.yearlyTax) || Number.isNaN(input.yearlyInsurance) || Number.isNaN(input.yearlyMaintenance) ||
    !within(appreciation, ASSUMPTION_RANGE.low, ASSUMPTION_RANGE.high) ||
    !within(rentIncrease, ASSUMPTION_RANGE.low, ASSUMPTION_RANGE.high) ||
    !within(investmentReturn, ASSUMPTION_RANGE.low, ASSUMPTION_RANGE.high) ||
    !within(sellingCosts, SELLING_COSTS_RANGE.low, SELLING_COSTS_RANGE.high) ||
    Number.isNaN(input.monthlyMi) || Number.isNaN(input.monthlyHoa) ||
    !within(input.incomeTaxRate, INCOME_TAX_RANGE.low, INCOME_TAX_RANGE.high)
  ) return null;

  const closingCosts = amount(input.closingCosts);
  const yearlyTax = amount(input.yearlyTax);
  const yearlyInsurance = amount(input.yearlyInsurance);
  const yearlyMaintenance = amount(input.yearlyMaintenance);
  const monthlyHoa = amount(input.monthlyHoa);
  const { incomeTaxRate } = input;
  const loanAmount = homePrice - downPayment;
  const ratePct = percent(rate);
  const payment = monthlyPayment(loanAmount, ratePct, termMonths);
  const balanceAfter = (payments: number) => remainingBalance(loanAmount, ratePct, termMonths, Math.min(payments, termMonths));

  // Mortgage insurance: on payments numbered below miEndPayment (the Mortgage calculator's rule).
  const monthlyMi = mortgageInsuranceApplies(input) ? amount(input.monthlyMi) : 0;
  let miEndPayment: number | null = null;
  if (monthlyMi > 0) {
    let cutoff = 1;
    while (cutoff < termMonths && balanceAfter(cutoff) > homePrice * MI_ENDS_AT) cutoff++;
    miEndPayment = Math.min(cutoff, termMonths / 2 + 1);
  }
  /** Payments carrying mortgage insurance among the first `payments` of the loan. */
  const miPaymentsWithin = (payments: number) => (miEndPayment === null ? 0 : Math.max(0, Math.min(payments, Math.ceil(miEndPayment) - 1)));

  // Running sums, unrounded, added in the dashboard's order. After the pass for year y they hold
  // the totals for a stay of y + 1 years, so one pass gives every year's answer.
  let mortgagePayments = 0;
  let propertyTax = 0;
  let insurance = 0;
  let maintenance = 0;
  let mortgageInsurance = 0;
  let hoa = 0;
  let interestPaid = 0;
  let totalPaid = downPayment + closingCosts;
  let rentPaid = 0;
  let rentNow = monthlyRent;

  const snapshots = Array.from({ length: MAX_YEARS }, (_, y) => {
    const years = y + 1;
    const inflation = Math.pow(1 + COST_INFLATION, y);
    const taxThisYear = yearlyTax * ((homePrice * Math.pow(1 + appreciation, y)) / homePrice);
    const insuranceThisYear = yearlyInsurance * inflation;
    const maintenanceThisYear = yearlyMaintenance * inflation;
    // Payments stop when the loan ends (the one difference from the dashboard).
    const paymentsThisYear = Math.min(12, Math.max(0, termMonths - y * 12));
    const mortgageThisYear = payment * paymentsThisYear;
    const miThisYear = monthlyMi * (miPaymentsWithin(years * 12) - miPaymentsWithin(y * 12));
    const hoaThisYear = monthlyHoa * 12 * inflation;
    // Interest is what was paid less what came off the balance. Nothing once the loan has ended.
    interestPaid += paymentsThisYear > 0 ? mortgageThisYear - (balanceAfter(y * 12) - balanceAfter(years * 12)) : 0;
    mortgagePayments += mortgageThisYear;
    mortgageInsurance += miThisYear;
    hoa += hoaThisYear;
    propertyTax += taxThisYear;
    insurance += insuranceThisYear;
    maintenance += maintenanceThisYear;
    totalPaid += mortgageThisYear + taxThisYear + insuranceThisYear + maintenanceThisYear + miThisYear + hoaThisYear;

    const lastMonthlyRent = rentNow;
    rentPaid += rentNow * 12;
    rentNow *= 1 + rentIncrease;

    const homeValue = homePrice * Math.pow(1 + appreciation, years);
    const loanBalance = balanceAfter(years * 12);
    const costOfSelling = homeValue * sellingCosts;
    const equity = homeValue - loanBalance - costOfSelling;
    const downPaymentGrowth = downPayment * Math.pow(1 + investmentReturn, years) - downPayment;
    const taxSaved = incomeTaxRate * interestPaid;
    const netCostBuying = totalPaid - taxSaved - equity;
    const netCostRenting = rentPaid - downPaymentGrowth;
    return {
      year: years,
      mortgagePayments, propertyTax, insurance, maintenance, mortgageInsurance, hoa, totalPaid, interestPaid, taxSaved,
      homeValue, loanBalance, costOfSelling, equity, netCostBuying,
      rentPaid, lastMonthlyRent, downPaymentGrowth, netCostRenting,
      difference: cents(netCostRenting - netCostBuying),
    };
  });

  const end = snapshots[stayYears - 1];
  const firstMonthMi = miPaymentsWithin(1) * monthlyMi;
  return {
    loanAmount: cents(loanAmount),
    monthlyPayment: cents(payment),
    firstMonth: {
      principalAndInterest: cents(payment),
      tax: cents(yearlyTax / 12),
      insurance: cents(yearlyInsurance / 12),
      mi: cents(firstMonthMi),
      hoa: cents(monthlyHoa),
      total: cents(payment + yearlyTax / 12 + yearlyInsurance / 12 + firstMonthMi + monthlyHoa),
    },
    miEndPayment,
    miMonthsInStay: miPaymentsWithin(Math.min(stayYears * 12, termMonths)),
    buying: {
      downPayment: cents(downPayment),
      closingCosts: cents(closingCosts),
      mortgagePayments: cents(end.mortgagePayments),
      propertyTax: cents(end.propertyTax),
      insurance: cents(end.insurance),
      mortgageInsurance: cents(end.mortgageInsurance),
      hoa: cents(end.hoa),
      maintenance: cents(end.maintenance),
      totalPaid: cents(end.totalPaid),
      interestPaid: cents(end.interestPaid),
      taxSavedOnInterest: cents(end.taxSaved),
      homeValue: cents(end.homeValue),
      loanBalance: cents(end.loanBalance),
      sellingCosts: cents(end.costOfSelling),
      equity: cents(end.equity),
      netCost: cents(end.netCostBuying),
    },
    renting: {
      rentPaid: cents(end.rentPaid),
      lastMonthlyRent: cents(end.lastMonthlyRent),
      downPaymentGrowth: cents(end.downPaymentGrowth),
      netCost: cents(end.netCostRenting),
    },
    difference: end.difference,
    ahead: end.difference > 0 ? "buying" : end.difference < 0 ? "renting" : "even",
    years: snapshots.slice(0, stayYears).map((s) => ({
      year: s.year,
      netCostBuying: cents(s.netCostBuying),
      netCostRenting: cents(s.netCostRenting),
      difference: s.difference,
    })),
    pullAheadYear: snapshots.find((s) => s.difference > 0)?.year ?? null,
  };
}

/**
 * True when buying is ahead in some year of the series and then, in a later year of it, is not
 * (behind or even). The page uses it so "pulls ahead in year N" is never said of a path that
 * falls back afterwards.
 */
export function buyingSlipsBack(years: YearPoint[]): boolean {
  const first = years.findIndex((y) => y.difference > 0);
  return first !== -1 && years.slice(first + 1).some((y) => y.difference <= 0);
}
