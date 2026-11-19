#!/usr/bin/env node
/**
 * Records golden cases for the public Home budget calculator (src/calculators/budget/) from the
 * dashboard's own code in the msfg-calc repo, which is the source of truth:
 *
 *   node scripts/calculators/golden-budget.mjs [path-to-msfg-calc]
 *
 * The dashboard function, calculate() in public/js/calculators/budget.js, is private to its file.
 * It reads the static inputs from the page, reads income and liabilities from row lists that are
 * also private to the file, and writes its answers back to the page. So this gives it a stand-in
 * page and uses it the way a person would:
 *
 *   - loads the dashboard's shared utils.js (for the real MSFG.parseNum and MSFG.formatCurrency)
 *     and then budget.js, and runs the setup budget.js registers for DOMContentLoaded. That setup
 *     (init) renders one empty employment income row and binds every input and button.
 *   - before each case, fires the click listener the file bound to its Clear button, which empties
 *     the rows, leaves one empty income row and resets the static inputs.
 *   - income: types the amount into the amount box of that rendered income row and fires the
 *     "input" listener the file bound to it. This is the dashboard's employment ("qualifying")
 *     income, the one its ratios use. The additional-income boxes stay empty, so qualifying income
 *     and total household income are the same figure (decision 1 of the plan).
 *   - debts: fires the click listener of the "Add Liability" button once per debt, then types the
 *     payment into the payment box of the row that click rendered and fires its "input" listener.
 *     Omit and payoff stay unticked.
 *   - housing, living costs, balances, tax rate and savings rate: sets the static inputs and fires
 *     the "input" listener the file bound to each. A total goes in one box of its group (housing in
 *     Principal & Interest, living in Other Living Expenses, balances in Savings Accounts); the
 *     `itemized` case fills the separate boxes. The Principal & Interest box is one the dashboard
 *     computes from the loan fields and overwrites unless it was typed in; firing its "input"
 *     listener is what marks it as typed, exactly as on the page.
 *
 * Nothing of calculate() is re-implemented here and no private state is reached into: the rows are
 * found through the stand-in page, as the elements budget.js itself appended to its two row
 * containers. The stand-in implements only what the file touches: getElementById (one plain object
 * per id, created on first use), createElement, appendChild, classList, dataset, style, an
 * innerHTML that empties the children when set, and listeners that can be fired by hand.
 *
 * Recorded per case is the text the dashboard displays: both ratios (percent, two decimals), both
 * status lines, the residual, spendable income, total expenses, net cash flow and months of
 * reserves. The dashboard's status lines use its own lending words; the public page does not show
 * them, the tests only map them to the three bands.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = path.resolve(process.argv[2] || process.env.MSFG_CALC || path.join(ROOT, "..", "msfg-calc"));
const OUT = path.join(ROOT, "src", "calculators", "budget", "golden.json");

const files = ["public/js/shared/utils.js", "public/js/calculators/budget.js"].map((f) => path.join(SRC, f));
for (const file of files) if (!fs.existsSync(file)) throw new Error("missing source file: " + file);

/** A stand-in element: enough of the DOM for budget.js to render rows into and bind listeners on. */
function node() {
  const listeners = {};
  const classes = new Set();
  const el = {
    value: "", textContent: "", title: "", placeholder: "", checked: false, dataset: {}, style: {}, children: [], listeners,
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c),
      toggle: (c, on) => ((on ?? !classes.has(c)) ? classes.add(c) : classes.delete(c)),
    },
    get className() { return [...classes].join(" "); },
    set className(text) { classes.clear(); for (const c of String(text).split(/\s+/).filter(Boolean)) classes.add(c); },
    get innerHTML() { return ""; },
    set innerHTML(_html) { el.children.length = 0; },
    appendChild(child) { el.children.push(child); return child; },
    addEventListener(type, fn) { (listeners[type] ??= []).push(fn); },
    querySelectorAll: () => [],
    remove() {},
  };
  return el;
}
const elements = new Map();
const element = (id) => {
  if (!elements.has(id)) elements.set(id, node());
  return elements.get(id);
};
/** Fires the listeners budget.js bound to an element; fails if there are none, so a rename in the dashboard is noticed. */
function fire(el, type, what) {
  const bound = el.listeners[type];
  if (!bound?.length) throw new Error(`budget.js bound no "${type}" listener to ${what}`);
  for (const fn of bound) fn({ target: el });
}
/** Types a value into an element and fires its "input" listeners. */
function type(el, value, what) {
  el.value = String(value);
  fire(el, "input", what);
}
/** The first element under `root` with the class, looking through what budget.js appended. */
function byClass(root, cls) {
  for (const child of root.children) {
    if (child.classList.contains(cls)) return child;
    const found = byClass(child, cls);
    if (found) return found;
  }
  return null;
}

const page = node(); // the ".calc-page" wrapper
const ready = [];
const win = { addEventListener() {}, location: { origin: "stand-in" } };
win.top = win; // not inside the workspace iframe: no tally message, no session populate
const context = vm.createContext({
  document: {
    getElementById: element,
    createElement: node,
    querySelector: (selector) => (selector === ".calc-page" ? page : null),
    querySelectorAll: () => [],
    addEventListener(type_, fn) { if (type_ === "DOMContentLoaded") ready.push(fn); },
  },
  window: win, Intl, console,
});
vm.runInContext(fs.readFileSync(files[0], "utf8"), context, { filename: files[0] });
const fromUtils = ready.length; // utils.js registers page chrome setup of its own; not needed here
vm.runInContext(fs.readFileSync(files[1], "utf8"), context, { filename: files[1] });
const setup = ready.slice(fromUtils);
if (setup.length !== 1) throw new Error(`expected budget.js to register one DOMContentLoaded handler, found ${setup.length}`);
setup[0]();

let commit = "unknown";
try { commit = execSync("git rev-parse --short HEAD", { cwd: SRC, stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch { /* not a git checkout */ }

// Public line id -> dashboard input id.
const HOUSING_IDS = { housingPi: "bgPI", housingTax: "bgPropertyTax", housingInsurance: "bgHomeInsurance", housingMi: "bgMI", housingHoa: "bgHOA" };
const LIVING_IDS = {
  livingUtilities: "bgUtilities", livingPhone: "bgTelecom", livingGroceries: "bgGroceries", livingTransport: "bgTransport",
  livingInsurance: "bgInsurance", livingChildcare: "bgChildcare", livingEntertainment: "bgEntertainment", livingOther: "bgOtherLiving",
};

// Monthly dollars; tax and savings are percents here, as typed on the dashboard.
const EXAMPLE = { income: 9000, taxPct: 22, savingsPct: 0, housing: 2700, debts: 600, living: 2500, balances: 0 };
const CASES = [
  ["example", {}],
  ["stretching", { income: 6000, taxPct: 18, housing: 2400, debts: 700, living: 1800 }],
  ["high", { income: 5000, taxPct: 15, housing: 2600, debts: 900, living: 1500 }],
  // Front exactly 32% and back exactly 47%: the top edge of the first band of each.
  ["band-edges", { income: 10000, taxPct: 0, housing: 3200, debts: 1500, living: 0 }],
  ["with-savings-and-balances", { savingsPct: 10, balances: 25000 }],
  ["no-debts-no-living", { income: 7000, taxPct: 0, housing: 2000, debts: 0, living: 0 }],
  ["expenses-over-income", { income: 4000, taxPct: 20, housing: 2500, debts: 1200, living: 1500 }],
  ["itemized", {
    lines: {
      housing: { housingPi: 1900, housingTax: 400, housingInsurance: 150, housingMi: 120, housingHoa: 130 },
      debts: [350, 180, 70],
      living: {
        livingUtilities: 250, livingPhone: 150, livingGroceries: 800, livingTransport: 300,
        livingInsurance: 400, livingChildcare: 350, livingEntertainment: 100, livingOther: 150,
      },
    },
  }],
];

const text = (id) => {
  const shown = element(id).textContent;
  if (typeof shown !== "string" || shown === "") throw new Error(`nothing displayed in #${id}`);
  return shown;
};
/** "$1,234.56" or "-$1,234.56" as a number. */
const money = (id) => {
  const n = Number(text(id).replace(/[$,]/g, ""));
  if (!Number.isFinite(n)) throw new Error(`unreadable amount in #${id}: ${JSON.stringify(text(id))}`);
  return n;
};
/** "36.67%" as 36.67. */
const percent = (id) => {
  const shown = text(id);
  if (!/^-?\d+\.\d\d%$/.test(shown)) throw new Error(`unreadable percent in #${id}: ${JSON.stringify(shown)}`);
  return Number(shown.slice(0, -1));
};
const sum = (amounts) => amounts.reduce((a, b) => a + b, 0);
const OUTPUTS = ["bgFrontDTI", "bgBackDTI", "bgFrontStatus", "bgBackStatus", "bgResidualIncome", "bgSpendableIncome", "bgGrandTotalExpenses", "bgNetCashFlow", "bgReserveMonths"];

/** Fills in the dashboard as a person would and returns what it displays. */
function run(c) {
  fire(element("bgClearBtn"), "click", "its Clear button");
  // Cleared so a run the dashboard skips cannot pass off the previous run's figures.
  for (const id of OUTPUTS) element(id).textContent = "";

  const incomeRows = element("bgIncomeBody").children;
  if (incomeRows.length !== 1) throw new Error(`expected Clear to leave one income row, found ${incomeRows.length}`);
  const amount = byClass(incomeRows[0], "bg-income-row__amount");
  if (!amount) throw new Error("no amount box in the income row budget.js rendered");
  type(amount, c.income, "the income row's amount box");

  const debts = c.lines ? c.lines.debts : c.debts > 0 ? [c.debts] : [];
  const liabilityRows = element("bgLiabilityBody").children;
  for (const payment of debts) {
    const before = liabilityRows.length;
    fire(element("bgAddLiabilityRow"), "click", "its Add Liability button");
    if (liabilityRows.length !== before + 1) throw new Error("Add Liability did not render a row");
    const box = byClass(liabilityRows[before], "bg-liab-col--payment");
    if (!box) throw new Error("no payment box in the liability row budget.js rendered");
    type(box, payment, "a liability row's payment box");
  }

  const housing = c.lines ? c.lines.housing : { housingPi: c.housing };
  for (const [line, value] of Object.entries(housing)) type(element(HOUSING_IDS[line]), value, "#" + HOUSING_IDS[line]);
  const living = c.lines ? c.lines.living : { livingOther: c.living };
  for (const [line, value] of Object.entries(living)) type(element(LIVING_IDS[line]), value, "#" + LIVING_IDS[line]);
  type(element("bgSavings"), c.balances, "#bgSavings");
  type(element("bgTaxRate"), c.taxPct, "#bgTaxRate");
  type(element("bgSavingsRate"), c.savingsPct, "#bgSavingsRate");

  const months = /^(\d+) months$/.exec(text("bgReserveMonths"));
  if (!months) throw new Error("unreadable months of reserves: " + JSON.stringify(text("bgReserveMonths")));
  return {
    frontRatioPct: percent("bgFrontDTI"),
    backRatioPct: percent("bgBackDTI"),
    frontStatus: text("bgFrontStatus"),
    backStatus: text("bgBackStatus"),
    residual: money("bgResidualIncome"),
    spendable: money("bgSpendableIncome"),
    totalExpenses: money("bgGrandTotalExpenses"),
    cashFlow: money("bgNetCashFlow"),
    reserveMonths: Number(months[1]),
  };
}

const cases = CASES.map(([name, changes]) => {
  const c = { ...EXAMPLE, ...changes };
  if (c.lines) {
    c.housing = sum(Object.values(c.lines.housing));
    c.debts = sum(c.lines.debts);
    c.living = sum(Object.values(c.lines.living));
  }
  const expected = run(c);
  return {
    name,
    // The model's input: rates as decimals, each group as its total.
    input: {
      grossIncome: c.income, taxRate: c.taxPct / 100, savingsRate: c.savingsPct / 100,
      housing: c.housing, debts: c.debts, living: c.living, balances: c.balances,
    },
    // What was typed line by line, by the public page's line ids. null when the case used totals.
    lines: c.lines ?? null,
    expected,
  };
});

fs.writeFileSync(OUT, JSON.stringify({ source: `msfg-calc ${commit}`, generatedBy: "scripts/calculators/golden-budget.mjs", cases }, null, 2) + "\n");
console.log(`wrote ${cases.length} cases from msfg-calc ${commit} to ${path.relative(ROOT, OUT)}`);
