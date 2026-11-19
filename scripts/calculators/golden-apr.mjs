#!/usr/bin/env node
/**
 * Records golden cases for the public APR calculator (src/calculators/apr/) from the dashboard's
 * own code in the msfg-calc repo, which is the source of truth:
 *
 *   node scripts/calculators/golden-apr.mjs [path-to-msfg-calc]
 *
 * The dashboard's math (calculate(), classifyFees(), solveApr() and the rest of
 * public/js/calculators/apr.js) is private to its file. It reads the loan fields and the lender
 * credit from the page, keeps the fee amounts in a private list that only its own "input" listener
 * fills, and writes its answers back to the page. So this gives it a stand-in page and uses it the
 * way a person would. Nothing of the math is re-implemented here and no private state is reached
 * into.
 *
 * For every case, on a fresh page (so nothing typed for one case is remembered in the next):
 *
 *   - loads the dashboard's shared/utils.js (the real MSFG.parseNum, formatCurrency and
 *     formatPercent), shared/apr-fee-catalog.js, shared/apr-mi-matrix.js and calculators/apr.js,
 *     and runs the setup apr.js registers for DOMContentLoaded. The boxes start with the values of
 *     views/calculators/apr.ejs (0 everywhere, a 30 year term, no credit score). The loan type is
 *     never touched, so it stays conventional (CONV), the file's default.
 *   - the setup pre-fills a dozen catalog fees with default amounts (underwriting 1,195, appraisal
 *     700 and so on). Every catalog fee except prepaid interest is therefore typed to 0 through
 *     the "input" listener the file bound to its fee list, the way a person would clear them.
 *   - LENDER FEES go in one catalog fee: `origination_fee` ("Origination Fee"). The catalog counts
 *     it in the APR for a conventional loan: aprFlagDefault APR_YES, applies to CONV, no condition
 *     codes and no default amount.
 *   - MORTGAGE INSURANCE. The dashboard fills `monthly_borrower_paid_pmi` by itself from its
 *     credit-score matrix whenever there is a loan amount and a property value, unless that fee
 *     was typed. Here it is typed in every case, 0 included, before the property value is entered:
 *     typing marks it as manually edited, which switches the matrix fill off for the page. The
 *     script then proves it: the fee box must still hold the case's amount at the end, and the
 *     dashboard's own "Show Calculations" steps must show the monthly MI line with exactly that
 *     amount, or no such line when the case has none. The credit score box is left empty.
 *   - PREPAID INTEREST. The dashboard fills `prepaid_interest` with 15 days of interest unless the
 *     fee was typed (and fills nothing at a 0% rate). It is left alone, so the automatic amount is
 *     what is recorded, except in the cases that override it, which type it.
 *   - LENDER CREDIT is read from the page inside classifyFees(), so it is typed into its box like
 *     the loan fields. Points and the property value likewise.
 *   - the loan fields go in through the "input" listeners the file bound to each box; the term is
 *     in years on the dashboard. The displayed figures are then wiped and the term's "change"
 *     listener is fired once more, so what is read was written by a calculation of the full case.
 *
 * Recorded per case is the text the dashboard displays: APR and note rate (percent, three
 * decimals), the spread, the monthly payment, the amount financed, the finance charges and the
 * total APR fees; the prepaid interest in its fee box; and from "Show Calculations" the total of
 * payments and, when there is mortgage insurance, how many payments carry it.
 *
 * The public page differs from the dashboard on purpose in two places (decisions 3 and 4 of the
 * plan, stated in src/calculators/apr/math.ts): with nothing counted the public APR is the rate
 * itself, and mortgage insurance without a home value gives no result. The golden file records
 * what the dashboard shows all the same.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = path.resolve(process.argv[2] || process.env.MSFG_CALC || path.join(ROOT, "..", "msfg-calc"));
const OUT = path.join(ROOT, "src", "calculators", "apr", "golden.json");

const files = [
  "public/js/shared/utils.js", "public/js/shared/apr-fee-catalog.js", "public/js/shared/apr-mi-matrix.js", "public/js/calculators/apr.js",
].map((f) => path.join(SRC, f));
for (const file of files) if (!fs.existsSync(file)) throw new Error("missing source file: " + file);
const sources = files.map((file) => new vm.Script(fs.readFileSync(file, "utf8"), { filename: file }));

const LENDER_FEE = "origination_fee";
const MI_FEE = "monthly_borrower_paid_pmi";
const PREPAID_FEE = "prepaid_interest";
/** The boxes of views/calculators/apr.ejs and what they hold when the page opens. */
const PAGE_DEFAULTS = {
  loanAmount: "0", interestRate: "0", loanTerm: "30", discountPoints: "0", propertyValue: "0", creditScore: "",
  lenderCredit: "0", sellerCredit: "0", aprLoanType: "CONV", vaUsage: "first",
};
const OUTPUTS = ["aprResult", "noteRateDisplay", "aprSpread", "monthlyPayment", "amountFinanced", "financeCharges", "totalUpfrontCosts", "calcSteps-apr"];

/** A stand-in element: enough of the DOM for apr.js to bind listeners on and write to. */
function node(id = "") {
  const listeners = {};
  const classes = new Set();
  const el = {
    id, value: "", textContent: "", innerHTML: "", title: "", dataset: {}, style: {}, listeners,
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c),
      toggle: (c, on) => ((on ?? !classes.has(c)) ? classes.add(c) : classes.delete(c)),
    },
    matches: (selector) => selector.startsWith(".") && classes.has(selector.slice(1)),
    closest: () => null,
    setAttribute() {},
    addEventListener(type, fn) { (listeners[type] ??= []).push(fn); },
    querySelectorAll: () => [],
  };
  // A fee's amount box, as feeRowHtml() in apr.js writes it: class apr-fee-input, data-fee-id.
  if (id.startsWith("fee_")) {
    classes.add("apr-fee-input");
    el.dataset.feeId = id.slice(4);
    el.value = "0";
  }
  return el;
}

/** Opens a fresh stand-in page, loads the dashboard files into it and runs apr.js's setup. */
function openPage() {
  const elements = new Map();
  const element = (id) => {
    if (!elements.has(id)) elements.set(id, node(id));
    return elements.get(id);
  };
  for (const [id, value] of Object.entries(PAGE_DEFAULTS)) element(id).value = value;

  const ready = [];
  const location = { search: "", href: "http://stand-in/calculators/apr", toString() { return this.href; } };
  const win = { addEventListener() {}, location, history: { replaceState() {} } };
  const context = vm.createContext({
    document: {
      activeElement: null,
      getElementById: element,
      // The rendered rows, pills and buttons are markup the stand-in does not parse; the file's
      // delegated listeners on #aprFeeGroups are fired by hand instead.
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener(type, fn) { if (type === "DOMContentLoaded") ready.push(fn); },
    },
    window: win, sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    URL, URLSearchParams, Intl, console,
  });
  sources[0].runInContext(context);
  const fromUtils = ready.length; // utils.js registers page chrome setup of its own; not needed here
  for (const script of sources.slice(1)) script.runInContext(context);
  const setup = ready.slice(fromUtils);
  if (setup.length !== 1) throw new Error(`expected apr.js to register one DOMContentLoaded handler, found ${setup.length}`);
  setup[0]();

  /** Fires the listeners apr.js bound to an element; fails if there are none, so a rename in the dashboard is noticed. */
  const fire = (el, type, target = el) => {
    const bound = el.listeners[type];
    if (!bound?.length) throw new Error(`apr.js bound no "${type}" listener to #${el.id}`);
    for (const fn of bound) fn({ target });
  };
  return {
    element, fire,
    feeIds: Object.keys(vm.runInContext("MSFG.AprFeeCatalog.feesForLoanType('CONV')", context)),
    countsInApr: (feeId) => vm.runInContext(`MSFG.AprFeeCatalog.resolveAprTreatment(${JSON.stringify(feeId)}, { loanType: 'CONV', amount: 1 }).includeInApr`, context),
    /** Types into one of the page's own boxes. */
    type(id, value) {
      element(id).value = String(value);
      fire(element(id), "input");
    },
    /** Types into a fee's amount box; the listener is the one delegated on the fee list. */
    typeFee(feeId, value) {
      const box = element("fee_" + feeId);
      box.value = String(value);
      fire(element("aprFeeGroups"), "input", box);
    },
  };
}

let commit = "unknown";
try { commit = execSync("git rev-parse --short HEAD", { cwd: SRC, stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch { /* not a git checkout */ }

// Percents here are as typed on the dashboard. prepaid null means "leave it to the dashboard".
const EXAMPLE = { loan: 320000, ratePct: 7, termMonths: 360, lenderFees: 4000, pointsPct: 0, lenderCredit: 0, monthlyMi: 0, homeValue: 0, prepaid: null };
const CASES = [
  ["example", {}],
  ["no-fees", { lenderFees: 0, prepaid: 0 }],
  ["points", { pointsPct: 1 }],
  ["credit-smaller", { lenderCredit: 1500 }],
  ["credit-larger", { lenderCredit: 9000 }],
  ["with-mi", { loan: 380000, homeValue: 400000, ratePct: 6.75, lenderFees: 3500, monthlyMi: 160 }],
  ["mi-not-needed", { loan: 300000, homeValue: 400000, ratePct: 6.75, lenderFees: 3500, monthlyMi: 160 }],
  ["fifteen-year", { loan: 250000, ratePct: 6.25, termMonths: 180, lenderFees: 3000, pointsPct: 0.5 }],
  ["prepaid-typed", { prepaid: 1800 }],
  ["zero-rate", { loan: 200000, ratePct: 0, lenderFees: 2000 }],
];

/** "$1,234.56" as a number. */
const money = (shown) => {
  if (!/^-?\$[\d,]+\.\d\d$/.test(shown)) throw new Error("unreadable amount: " + JSON.stringify(shown));
  return Number(shown.replace(/[$,]/g, ""));
};
/** "7.153%" or "+0.153%" as a number; three decimals. */
const percent = (shown) => {
  if (!/^[+-]?\d+\.\d{3}%$/.test(shown)) throw new Error("unreadable percent: " + JSON.stringify(shown));
  return Number(shown.slice(0, -1));
};

/** Fills in the dashboard as a person would and returns what it displays. */
function run(c) {
  const page = openPage();
  if (!page.countsInApr(LENDER_FEE)) throw new Error(`the catalog no longer counts ${LENDER_FEE} in the APR for a conventional loan`);
  for (const id of [LENDER_FEE, MI_FEE, PREPAID_FEE]) if (!page.feeIds.includes(id)) throw new Error("no such conventional fee in the catalog: " + id);

  // Clear every pre-filled fee. Typing the mortgage insurance fee here, 0 included, is also what
  // switches the dashboard's matrix fill off. Prepaid interest is left to the dashboard.
  for (const feeId of page.feeIds) if (feeId !== PREPAID_FEE) page.typeFee(feeId, 0);
  page.typeFee(MI_FEE, c.monthlyMi);
  page.typeFee(LENDER_FEE, c.lenderFees);

  if (c.termMonths % 12 !== 0) throw new Error("the dashboard takes the term in whole years");
  page.type("loanAmount", c.loan);
  page.type("interestRate", c.ratePct);
  page.type("loanTerm", c.termMonths / 12);
  page.type("discountPoints", c.pointsPct);
  page.type("lenderCredit", c.lenderCredit);
  page.type("propertyValue", c.homeValue);
  if (c.prepaid !== null) page.typeFee(PREPAID_FEE, c.prepaid);

  // Wiped so that what is read below was written by a calculation of the whole case.
  for (const id of OUTPUTS) { page.element(id).textContent = ""; page.element(id).innerHTML = ""; }
  page.fire(page.element("loanTerm"), "change");

  const text = (id) => {
    const shown = page.element(id).textContent;
    if (typeof shown !== "string" || shown === "") throw new Error(`nothing displayed in #${id}`);
    return shown;
  };
  const steps = page.element("calcSteps-apr").innerHTML;
  if (!steps.includes("<strong>CONV</strong>")) throw new Error("the loan type is not conventional");

  // No mortgage insurance the case did not ask for: the box and the dashboard's own steps agree.
  if (Number(page.element("fee_" + MI_FEE).value) !== c.monthlyMi) throw new Error("the dashboard changed the mortgage insurance box");
  const mi = /Step 2b: Monthly MI.*?Added to payment stream for (?:life of loan \((\d+) pmts\)|(\d+) pmts \(\d+ yrs\)).*?<strong>(\$[\d,.]+)\/mo<\/strong>/.exec(steps);
  if (c.monthlyMi > 0 ? !mi || money(mi[3]) !== c.monthlyMi : steps.includes("Monthly MI")) {
    throw new Error("the mortgage insurance in the dashboard's steps is not the case's");
  }
  const payments = /Step 4: Total Finance Charges.*?= (\$[\d,.]+) − /.exec(steps);
  if (!payments) throw new Error("no total of payments in the dashboard's steps");

  const prepaidShown = Number(page.element("fee_" + PREPAID_FEE).value);
  if (c.prepaid !== null && prepaidShown !== c.prepaid) throw new Error("the dashboard changed the typed prepaid interest");
  const spread = text("aprSpread");
  if (spread !== text("aprSpread2") || text("aprResult") !== text("aprDisplay")) throw new Error("the dashboard's two result cards disagree");

  return {
    aprPct: percent(text("aprResult")),
    noteRatePct: percent(text("noteRateDisplay")),
    spreadPct: percent(spread),
    // As displayed, sign included: the dashboard can show "-0.000%".
    spreadText: spread,
    principalAndInterest: money(text("monthlyPayment")),
    amountFinanced: money(text("amountFinanced")),
    financeCharge: money(text("financeCharges")),
    feesTotal: money(text("totalUpfrontCosts")),
    prepaidInterest: prepaidShown,
    totalOfPayments: money(payments[1]),
    miMonths: mi ? Number(mi[1] ?? mi[2]) : 0,
  };
}

const cases = CASES.map(([name, changes]) => {
  const c = { ...EXAMPLE, ...changes };
  return {
    name,
    // The model's input: rates as decimals, the term in months. prepaidInterest null is "automatic" (NaN in the model).
    input: {
      loanAmount: c.loan, rate: c.ratePct / 100, termMonths: c.termMonths,
      lenderFees: c.lenderFees, points: c.pointsPct / 100, lenderCredit: c.lenderCredit,
      monthlyMi: c.monthlyMi, homeValue: c.homeValue, prepaidInterest: c.prepaid,
    },
    expected: run(c),
  };
});

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ source: `msfg-calc ${commit}`, generatedBy: "scripts/calculators/golden-apr.mjs", lenderFeesIn: LENDER_FEE, cases }, null, 2) + "\n");
console.log(`wrote ${cases.length} cases from msfg-calc ${commit} to ${path.relative(ROOT, OUT)}`);
