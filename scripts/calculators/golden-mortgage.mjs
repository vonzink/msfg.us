#!/usr/bin/env node
/**
 * Records golden cases for the public Mortgage calculator (src/calculators/mortgage/) from the
 * dashboard's own amortization code in the msfg-calc repo, which is the source of truth:
 *
 *   node scripts/calculators/golden-mortgage.mjs [path-to-msfg-calc]
 *
 * It runs each case below through MSFG.AmortizationMath.calculate (purchase, conventional) and
 * writes inputs and outputs to src/calculators/mortgage/golden.json. math.test.ts then requires
 * math.ts to reproduce every number. Rerun this when the dashboard math changes and read the diff.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = path.resolve(process.argv[2] || process.env.MSFG_CALC || path.join(ROOT, "..", "msfg-calc"));
const OUT = path.join(ROOT, "src", "calculators", "mortgage", "golden.json");

// Load the browser scripts the way msfg-calc's own test does, so this exercises the real code.
const context = vm.createContext({ window: {}, document: { addEventListener() {} }, Intl, console });
for (const file of ["shared/utils.js", "shared/amortization-math.js"]) {
  const p = path.join(SRC, "public", "js", file);
  if (!fs.existsSync(p)) throw new Error("missing source file: " + p);
  vm.runInContext(fs.readFileSync(p, "utf8"), context);
}
const math = vm.runInContext("MSFG.AmortizationMath", context);

let commit = "unknown";
try { commit = execSync("git rev-parse --short HEAD", { cwd: SRC, stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch { /* not a git checkout */ }

/** A public MortgageInput with everything optional at zero. */
const input = (changes) => ({
  homePrice: 0, downPayment: 0, annualRate: 0, termYears: 30,
  yearlyTax: 0, yearlyInsurance: 0, monthlyHoa: 0, monthlyPmi: 0,
  extraAmount: 0, extraFrequency: "monthly", startMonth: 0, startYear: 2027,
  ...changes,
});
const reference = { homePrice: 250000, downPayment: 50000, annualRate: 0.075, termYears: 30, yearlyTax: 2500, yearlyInsurance: 1500, monthlyHoa: 100 };

const CASES = [
  ["reference", input(reference)],
  ["zero-rate", input({ homePrice: 250000, downPayment: 50000, annualRate: 0, termYears: 10 })],
  ["zero-down-pmi", input({ homePrice: 300000, downPayment: 0, annualRate: 0.07, termYears: 30, monthlyPmi: 150 })],
  ["twenty-percent-no-pmi", input({ homePrice: 300000, downPayment: 60000, annualRate: 0.07, termYears: 30, monthlyPmi: 150 })],
  ["extra-monthly", input({ ...reference, extraAmount: 200, extraFrequency: "monthly" })],
  ["extra-annual", input({ ...reference, extraAmount: 1000, extraFrequency: "annually" })],
  ["one-time-huge", input({ ...reference, extraAmount: 500000, extraFrequency: "one-time" })],
  ["no-optionals", input({ homePrice: 400000, downPayment: 80000, annualRate: 0.07, termYears: 15 })],
];

/** The public inputs as the dashboard expects them. Extra payments start with the first payment. */
const toDashboard = (i) => ({
  mode: "purchase", program: "conventional",
  homePrice: i.homePrice, downPayment: i.downPayment,
  refiLoanAmount: 0, cashOut: 0, appraisedValue: i.homePrice,
  annualRate: i.annualRate, termYears: i.termYears, startMonth: i.startMonth, startYear: i.startYear,
  monthlyTax: i.yearlyTax / 12, monthlyIns: i.yearlyInsurance / 12, monthlyHOA: i.monthlyHoa, monthlyPMI: i.monthlyPmi,
  extraAmount: i.extraAmount, extraFreq: i.extraFrequency, extraStartMonth: i.startMonth, extraStartYear: i.startYear,
  vaUse: "first", vaExempt: false, vaRefiType: "cash-out",
});

const row = (r) => ({
  paymentNum: r.paymentNum, month: r.month, year: r.year, principal: r.principal, interest: r.interest,
  extra: r.extra, balance: r.balance, pmi: r.pmiThisMonth, totalMonthly: r.totalMonthly,
});

const cases = CASES.map(([name, i]) => {
  const r = math.calculate(toDashboard(i));
  if (!r) throw new Error(`the dashboard rejected case "${name}"`);
  const s = r.schedule;
  return {
    name,
    input: i,
    expected: {
      loanAmount: r.loan.principal, monthlyPI: r.monthlyPI, totalInterest: r.totalInterest, totalCost: r.totalCost,
      interestSaved: r.interestSaved, monthsSaved: r.monthsSaved, pmiEndPayment: r.pmiEnd, scheduleLength: s.length,
      rows: [s[0], s[Math.min(11, s.length - 1)], s[s.length - 1]].map(row),
    },
  };
});

fs.writeFileSync(OUT, JSON.stringify({ source: `msfg-calc ${commit}`, generatedBy: "scripts/calculators/golden-mortgage.mjs", cases }, null, 2) + "\n");
console.log(`wrote ${cases.length} cases from msfg-calc ${commit} to ${path.relative(ROOT, OUT)}`);
