#!/usr/bin/env node
/**
 * Records golden cases for the public Blended rate calculator (src/calculators/blended-rate/)
 * from the dashboard's own code in the msfg-calc repo, which is the source of truth:
 *
 *   node scripts/calculators/golden-blended-rate.mjs [path-to-msfg-calc]
 *
 * The dashboard function, calcDebt in legacy/gen-calc/blended-rate.js, reads five debt rows from
 * the page and writes its answers back to the page. So this gives it a stand-in page: it fills in
 * the row inputs, calls calcDebt(), and records the three figures the dashboard would display.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = path.resolve(process.argv[2] || process.env.MSFG_CALC || path.join(ROOT, "..", "msfg-calc"));
const OUT = path.join(ROOT, "src", "calculators", "blended-rate", "golden.json");

const file = path.join(SRC, "legacy", "gen-calc", "blended-rate.js");
if (!fs.existsSync(file)) throw new Error("missing source file: " + file);

// One plain object per element id, created on first use, so inputs can be set and outputs read.
const elements = new Map();
const element = (id) => {
  if (!elements.has(id)) {
    elements.set(id, { value: "", textContent: "", innerHTML: "", classList: { add() {}, remove() {}, contains: () => false } });
  }
  return elements.get(id);
};
const context = vm.createContext({
  document: { getElementById: element, addEventListener() {}, querySelectorAll: () => [] },
  window: {}, Intl, console,
});
vm.runInContext(fs.readFileSync(file, "utf8"), context);

let commit = "unknown";
try { commit = execSync("git rev-parse --short HEAD", { cwd: SRC, stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch { /* not a git checkout */ }

// Each debt is [balance, rate as a percent, monthly payment]. An empty string is a field left blank.
const CASES = [
  ["mortgage-and-heloc", [[250000, 3.5, 1123], [60000, 9, 450]]],
  ["single-debt", [[180000, 6.25, 1108]]],
  ["five-debts", [[300000, 4, 1432], [45000, 8.5, 390], [22000, 6.9, 410], [9000, 24.99, 270], [15000, 5.5, 163]]],
  ["missing-rate", [[200000, 4, 955], [50000, "", 300]]],
  ["no-payments", [[250000, 3.5, ""], [60000, 9, ""]]],
  ["zero-rate-debt", [[20000, 0, 400], [80000, 7, 532]]],
];

const cases = CASES.map(([name, debts]) => {
  for (let i = 1; i <= 5; i++) {
    const [balance = "", rate = "", payment = ""] = debts[i - 1] ?? [];
    element(`d${i}_bal`).value = String(balance);
    element(`d${i}_rate`).value = String(rate);
    element(`d${i}_pay`).value = String(payment);
  }
  context.calcDebt();
  return {
    name,
    debts: debts.map(([balance, ratePct, payment], i) => ({ name: `Debt ${i + 1}`, balance, ratePct, payment })),
    expected: {
      blendedRate: element("blendedRate").textContent,
      totalBalance: element("totalBal").textContent,
      totalPayment: element("totalPay").textContent,
    },
  };
});

fs.writeFileSync(OUT, JSON.stringify({ source: `msfg-calc ${commit}`, generatedBy: "scripts/calculators/golden-blended-rate.mjs", cases }, null, 2) + "\n");
console.log(`wrote ${cases.length} cases from msfg-calc ${commit} to ${path.relative(ROOT, OUT)}`);
