#!/usr/bin/env node
/**
 * Records golden cases for the public Rent vs buy calculator (src/calculators/rent-vs-buy/)
 * from the dashboard's own code in the msfg-calc repo, which is the source of truth:
 *
 *   node scripts/calculators/golden-rent-vs-buy.mjs [path-to-msfg-calc]
 *
 * The dashboard function, calculate() in public/js/calculators/buy-vs-rent.js, is private to its
 * file, reads its inputs from the page and writes its answers back to the page. So this gives it a
 * stand-in page: it loads the dashboard's shared utils.js (for the real MSFG.parseNum and
 * MSFG.formatCurrency) and then buy-vs-rent.js, runs the setup the file registers for
 * DOMContentLoaded, fills in the inputs, fires the "input" listener the file bound to them, and
 * reads back the text the dashboard would display.
 *
 * The dashboard answers for one analysis period. The public page also shows the path year by
 * year, so each case is run once for every period from 1 to the stay and the signed difference is
 * recorded for each ("Buying saves you" is positive, "Renting saves you" negative).
 *
 * Cost inflation is entered as 3%, the fixed COST_INFLATION of the public model. Every case keeps
 * the stay within the loan term: past the term the dashboard goes on charging payments and the
 * public model deliberately does not (see the comment block in math.ts).
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = path.resolve(process.argv[2] || process.env.MSFG_CALC || path.join(ROOT, "..", "msfg-calc"));
const OUT = path.join(ROOT, "src", "calculators", "rent-vs-buy", "golden.json");
const COST_INFLATION_PCT = 3;

const files = ["public/js/shared/utils.js", "public/js/calculators/buy-vs-rent.js"].map((f) => path.join(SRC, f));
for (const file of files) if (!fs.existsSync(file)) throw new Error("missing source file: " + file);

// One plain object per element id, created on first use, so inputs can be set, outputs read and
// the listeners the dashboard binds can be fired.
const elements = new Map();
const element = (id) => {
  if (!elements.has(id)) {
    const listeners = {};
    elements.set(id, {
      value: "", textContent: "", innerHTML: "", dataset: {}, listeners,
      classList: { add() {}, remove() {}, contains: () => false },
      addEventListener(type, fn) { (listeners[type] ??= []).push(fn); },
    });
  }
  return elements.get(id);
};
const ready = [];
const context = vm.createContext({
  document: {
    getElementById: element,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener(type, fn) { if (type === "DOMContentLoaded") ready.push(fn); },
  },
  window: {}, Intl, console,
});
vm.runInContext(fs.readFileSync(files[0], "utf8"), context, { filename: files[0] });
const fromUtils = ready.length; // utils.js registers page chrome setup of its own; not needed here
vm.runInContext(fs.readFileSync(files[1], "utf8"), context, { filename: files[1] });
const setup = ready.slice(fromUtils);
if (setup.length !== 1) throw new Error(`expected buy-vs-rent.js to register one DOMContentLoaded handler, found ${setup.length}`);
setup[0]();

// Both toggles to dollars: the down payment and the property tax are typed as amounts.
element("downToggle").dataset.mode = "dollar";
element("taxToggle").dataset.mode = "dollar";

const recalculate = element("period").listeners.input?.[0];
if (typeof recalculate !== "function") throw new Error("buy-vs-rent.js did not bind its calculate() to the period input");

let commit = "unknown";
try { commit = execSync("git rev-parse --short HEAD", { cwd: SRC, stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch { /* not a git checkout */ }

// Rates are percents here, as typed on the dashboard. The loan term is months.
const EXAMPLE = {
  monthlyRent: 2400, homePrice: 400000, downPayment: 80000, ratePct: 7, stayYears: 7, termMonths: 360,
  yearlyTax: 4800, yearlyInsurance: 1800, yearlyMaintenance: 4000,
  appreciationPct: 3, rentIncreasePct: 3, sellingCostsPct: 6, investmentReturnPct: 5,
};
const CASES = [
  ["example", {}],
  ["zero-rate", { ratePct: 0 }],
  ["zero-down", { downPayment: 0 }],
  ["empty-optionals", { yearlyTax: 0, yearlyInsurance: 0, yearlyMaintenance: 0, appreciationPct: 0, rentIncreasePct: 0, sellingCostsPct: 0, investmentReturnPct: 0 }],
  ["renting-ahead", { monthlyRent: 1600, stayYears: 3 }],
  ["fifteen-year-full-term", { termMonths: 180, stayYears: 15 }],
  ["thirty-years", { stayYears: 30 }],
];

/** "$1,234.56", "-$1,234.56" and the breakdown's "-" + "$1,234.56" as a number. */
const money = (id) => {
  const text = element(id).textContent;
  const n = Number(text.replace(/[$,]/g, "").replace(/^--/, ""));
  if (text === "" || !Number.isFinite(n)) throw new Error(`unreadable amount in #${id}: ${JSON.stringify(text)}`);
  return n;
};

/** Runs the dashboard for one analysis period and returns what it displays. */
function run(c, period) {
  const typed = {
    purchasePrice: c.homePrice, downPaymentInput: c.downPayment, taxInput: c.yearlyTax, rateBuy: c.ratePct,
    termBuy: c.termMonths / 12, insurance: c.yearlyInsurance, maintenance: c.yearlyMaintenance,
    appreciation: c.appreciationPct, costInflation: COST_INFLATION_PCT, sellingCosts: c.sellingCostsPct,
    rent: c.monthlyRent, rentIncrease: c.rentIncreasePct, period, investmentReturn: c.investmentReturnPct,
  };
  for (const [id, value] of Object.entries(typed)) element(id).value = String(value);
  // Cleared first so a run the dashboard skips cannot pass off the previous run's figures.
  for (const id of ["recommendationText", "difference", "mortgagePay"]) element(id).textContent = "";
  recalculate();

  const headline = element("recommendationText").textContent;
  if (headline !== "Buying saves you" && headline !== "Renting saves you") throw new Error("unexpected recommendation text: " + JSON.stringify(headline));
  const sign = headline === "Buying saves you" ? 1 : -1;
  return {
    monthlyPayment: money("mortgagePay"),
    downPayment: money("downPayment"),
    mortgagePayments: money("mortgageTotal"),
    propertyTax: money("taxesTotal"),
    insurance: money("insuranceTotal"),
    maintenance: money("maintenanceTotal"),
    totalPaid: money("ownCost"),
    equity: money("equity"),
    netCostBuying: money("netOwnBreakdown"),
    rentPaid: money("rentTotal"),
    // Displayed as "-" + the growth, so the sign is turned back.
    downPaymentGrowth: -money("investGrowthDisplay") + 0,
    netCostRenting: money("netRentBreakdown"),
    difference: sign * money("difference") + 0,
  };
}

const cases = CASES.map(([name, changes]) => {
  const c = { ...EXAMPLE, ...changes };
  if (c.stayYears * 12 > c.termMonths) throw new Error(`${name}: the stay is longer than the loan term, where the public model departs from the dashboard`);
  const byYear = Array.from({ length: c.stayYears }, (_, i) => run(c, i + 1));
  const { difference: _difference, ...atStay } = byYear[byYear.length - 1];
  return {
    name,
    input: {
      monthlyRent: c.monthlyRent, homePrice: c.homePrice, downPayment: c.downPayment, rate: c.ratePct / 100,
      stayYears: c.stayYears, termMonths: c.termMonths,
      yearlyTax: c.yearlyTax, yearlyInsurance: c.yearlyInsurance, yearlyMaintenance: c.yearlyMaintenance,
      appreciation: c.appreciationPct / 100, rentIncrease: c.rentIncreasePct / 100,
      sellingCosts: c.sellingCostsPct / 100, investmentReturn: c.investmentReturnPct / 100,
    },
    expected: { ...atStay, differenceByYear: byYear.map((y) => y.difference) },
  };
});

fs.writeFileSync(OUT, JSON.stringify({ source: `msfg-calc ${commit}`, generatedBy: "scripts/calculators/golden-rent-vs-buy.mjs", costInflationPct: COST_INFLATION_PCT, cases }, null, 2) + "\n");
console.log(`wrote ${cases.length} cases from msfg-calc ${commit} to ${path.relative(ROOT, OUT)}`);
