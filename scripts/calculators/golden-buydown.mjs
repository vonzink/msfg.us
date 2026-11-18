#!/usr/bin/env node
/**
 * Records golden cases for the public Rate buydown calculator (src/calculators/buydown/) from the
 * dashboard's own code in the msfg-calc repo, which is the source of truth:
 *
 *   node scripts/calculators/golden-buydown.mjs [path-to-msfg-calc]
 *
 * It runs each case below through calculateBuydownResults in legacy/buydown-calc/buydown.js and
 * writes inputs and outputs to src/calculators/buydown/golden.json. math.test.ts then requires
 * math.ts to reproduce every number to the cent. Rerun this when the dashboard math changes.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = path.resolve(process.argv[2] || process.env.MSFG_CALC || path.join(ROOT, "..", "msfg-calc"));
const OUT = path.join(ROOT, "src", "calculators", "buydown", "golden.json");

// The script is a plain browser file: its functions become globals, and it only touches the
// document when the page loads, which never happens here.
const file = path.join(SRC, "legacy", "buydown-calc", "buydown.js");
if (!fs.existsSync(file)) throw new Error("missing source file: " + file);
const context = vm.createContext({ document: { addEventListener() {} }, window: {}, Intl, console });
vm.runInContext(fs.readFileSync(file, "utf8"), context);

let commit = "unknown";
try { commit = execSync("git rev-parse --short HEAD", { cwd: SRC, stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch { /* not a git checkout */ }

const cents = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
const input = (changes) => ({ loanAmount: 320000, annualRate: 0.07, termYears: 30, type: "2-1", yearlyTax: 0, yearlyInsurance: 0, monthlyHoa: 0, ...changes });

const CASES = [
  ["2-1", input({})],
  ["3-2-1", input({ type: "3-2-1" })],
  ["1-1", input({ type: "1-1" })],
  ["1-0", input({ type: "1-0" })],
  ["2-1-with-costs", input({ yearlyTax: 4800, yearlyInsurance: 1800, monthlyHoa: 100 })],
  ["3-2-1-fifteen-year", input({ loanAmount: 250000, annualRate: 0.0625, termYears: 15, type: "3-2-1" })],
  ["3-2-1-floored", input({ loanAmount: 200000, annualRate: 0.02, type: "3-2-1" })],
];

// Which of the dashboard's four rows it shows for each type; the last is always the full rate.
const SHOWN = { "3-2-1": [0, 1, 2, 3], "2-1": [0, 1, 3], "1-1": [0, 1, 3], "1-0": [0, 3] };
// The dashboard takes the rate as a percent. Round away the float noise of 0.07 * 100.
const percent = (rate) => Number((rate * 100).toFixed(6));

const cases = CASES.map(([name, i]) => {
  const r = context.calculateBuydownResults({
    loanAmount: i.loanAmount, noteRate: percent(i.annualRate), loanTerm: i.termYears, buydownType: i.type,
    includeTaxes: true, includeInsurance: true, propertyTaxes: i.yearlyTax, insurance: i.yearlyInsurance, hoa: i.monthlyHoa,
  });
  const shown = SHOWN[i.type];
  return {
    name,
    input: i,
    expected: {
      totalCost: cents(r.totalCost),
      periods: shown.map((index, position) => {
        const y = r.years[index];
        return {
          // The full-rate row is the year after the last reduced one.
          year: position === shown.length - 1 ? shown.length : y.year,
          reduced: y.isReduced,
          ratePct: Number(y.rate.toFixed(6)),
          principalAndInterest: cents(y.piPayment),
          total: cents(y.totalPayment),
          monthlySavings: cents(y.monthlySavings),
          yearlySavings: cents(y.yearlySavings),
        };
      }),
    },
  };
});

fs.writeFileSync(OUT, JSON.stringify({ source: `msfg-calc ${commit}`, generatedBy: "scripts/calculators/golden-buydown.mjs", cases }, null, 2) + "\n");
console.log(`wrote ${cases.length} cases from msfg-calc ${commit} to ${path.relative(ROOT, OUT)}`);
