#!/usr/bin/env node
/**
 * Records golden cases for the public Refinance breakeven calculator
 * (src/calculators/refinance-breakeven/) from the dashboard's own engine in the msfg-calc repo:
 *
 *   node scripts/calculators/golden-refinance-breakeven.mjs [path-to-msfg-calc]
 *
 * It runs each case through RefiEngine.runAnalysis in legacy/refi-calc/js/refi-engine.js with the
 * cost-of-waiting scenario switched off, and writes what the dashboard would show for the payments,
 * the monthly savings, the breakeven and the net savings to golden.json. math.test.ts then requires
 * math.ts to reproduce every number. Rerun this when the dashboard math changes and read the diff.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = path.resolve(process.argv[2] || process.env.MSFG_CALC || path.join(ROOT, "..", "msfg-calc"));
const OUT = path.join(ROOT, "src", "calculators", "refinance-breakeven", "golden.json");

const file = path.join(SRC, "legacy", "refi-calc", "js", "refi-engine.js");
if (!fs.existsSync(file)) throw new Error("missing source file: " + file);
const context = vm.createContext({ window: {}, document: { addEventListener() {} }, Intl, console });
vm.runInContext(fs.readFileSync(file, "utf8"), context);
const engine = vm.runInContext("RefiEngine", context);

let commit = "unknown";
try { commit = execSync("git rev-parse --short HEAD", { cwd: SRC, stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch { /* not a git checkout */ }

/** A public BreakevenInput. `keepMonths: null` means the visitor gave none. */
const input = (changes) => ({
  currentBalance: 300000, currentRate: 0.08, monthsLeft: 324,
  newRate: 0.07, newTermMonths: 360, closingCosts: 6000,
  newLoanAmount: null, cashOut: 0, debtPaymentsPaidOff: 0, currentMi: 0, newMi: 0, keepMonths: null,
  ...changes,
});

const CASES = [
  ["example", input({})],
  ["shorter-term", input({ newRate: 0.065, newTermMonths: 180, keepMonths: 120 })],
  ["no-savings", input({ currentRate: 0.06 })],
  ["longer-term-more-interest", input({ currentBalance: 250000, currentRate: 0.0725, monthsLeft: 264, newRate: 0.0675, closingCosts: 5000, keepMonths: 84 })],
  ["cash-out-with-debts", input({ cashOut: 40000, newLoanAmount: 340000, debtPaymentsPaidOff: 900, closingCosts: 7000, keepMonths: 60 })],
  ["with-mi", input({ currentMi: 140, newMi: 95 })],
  ["zero-closing-costs", input({ closingCosts: 0 })],
];

// The dashboard takes rates as percents. Round away the float noise of 0.07 * 100.
const percent = (rate) => Number((rate * 100).toFixed(6));
const cents = (x) => Math.round(x * 100) / 100;

const cases = CASES.map(([name, i]) => {
  const loan = i.newLoanAmount ?? i.currentBalance + i.cashOut;
  const r = engine.runAnalysis({
    currentBalance: i.currentBalance, currentRate: percent(i.currentRate), currentTermRemaining: i.monthsLeft,
    refiLoanAmount: loan, refiRate: percent(i.newRate), refiTerm: i.newTermMonths,
    // The dashboard insists on a plan-to-stay period. 60 is a stand-in when the case has none.
    planToStayMonths: i.keepMonths ?? 60,
    costOfWaitingEnabled: false,
    fees: { feeUnderwriting: i.closingCosts, feeMonthlyMI: i.newMi },
    currentMIMonthlyDollar: i.currentMi,
    cashOutEnabled: i.cashOut > 0 || i.debtPaymentsPaidOff > 0,
    cashOutAmount: i.cashOut, cashOutDebtPayments: i.debtPaymentsPaidOff,
  });
  if (!r.valid) throw new Error(`the dashboard rejected case "${name}": ${r.errors.join(" ")}`);
  return {
    name,
    input: i,
    expected: {
      currentPayment: cents(r.currentPayment + r.currentMonthlyMI),
      newPayment: cents(r.refiPayment + r.refiMonthlyMI),
      monthlySavings: r.analysis.monthlySavingsNow,
      breakevenMonths: Number.isFinite(r.analysis.breakevenNow) ? r.analysis.breakevenNow : null,
      netSavings: i.keepMonths === null ? null : r.analysis.refiNowNetSavings,
      // What is still owed on each loan after the keep period, from the engine's own balance function.
      balanceNowLoan: i.keepMonths === null ? null : cents(engine.calcRemainingBalance(i.currentBalance, percent(i.currentRate), i.monthsLeft, Math.min(i.keepMonths, i.monthsLeft))),
      balanceNewLoan: i.keepMonths === null ? null : cents(engine.calcRemainingBalance(loan, percent(i.newRate), i.newTermMonths, Math.min(i.keepMonths, i.newTermMonths))),
    },
  };
});

fs.writeFileSync(OUT, JSON.stringify({ source: `msfg-calc ${commit}`, generatedBy: "scripts/calculators/golden-refinance-breakeven.mjs", cases }, null, 2) + "\n");
console.log(`wrote ${cases.length} cases from msfg-calc ${commit} to ${path.relative(ROOT, OUT)}`);
