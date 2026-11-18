import { describe, expect, it } from "vitest";
import { projectReo } from "./math";
import { BLANK, EXAMPLE, FIELDS, toModel, toNumbers, verdict, type Values } from "./fields";

const project = (values: Values) => {
  const n = toNumbers(values);
  return { n, r: projectReo(toModel(values, n)) };
};
const field = (id: string) => FIELDS.find((f) => f.id === id)!;

describe("default deal", () => {
  // $500,000 all cash, $3,780 rent, $6,000 closing + $13,000 renovation over 2 months,
  // long-term sale tax, compared with 4% a year. Checked by hand against the live page.
  const { n, r } = project(EXAMPLE);

  it("opens on the reviewed numbers", () => {
    expect(r.cashInvested).toBe(519_000);
    expect(r.loanAmount).toBe(0);
    expect(r.cashFlow[0] / 12).toBeCloseTo(2165.83, 2);
    expect(r.capRate[0]).toBeCloseTo(32_552 / 500_000, 9);
    expect(r.cashOnCash[0]).toBeCloseTo(25_990 / 519_000, 9);
    expect(Number.isNaN(r.dcr[1])).toBe(true);
    expect(r.cumulativeReturn[4]).toBeCloseTo(147_031.92, 1);
    expect(r.vsAlt[4]).toBeCloseTo(147_031.92 - 519_000 * (1.04 ** 5 - 1), 1);
  });

  it("counts tax on the sale and holds rental losses by default", () => {
    expect(EXAMPLE.saleTax).toBe("long");
    expect(EXAMPLE.lossesNow).toBe("no");
    expect(toModel(EXAMPLE, n).useLossesNow).toBe(false);
    expect(r.saleTax[4]).toBeGreaterThan(0);
  });

  it("explains the result in plain words", () => {
    expect(verdict(n, r)).toBe(
      "The rent covers the bills with about $2,166 a month left over in year 1. " +
        "Selling after year 2 would get back more than you put in. It would beat 4% a year after year 3.",
    );
  });

  it("keeps the loan fields filled in so switching to a loan works", () => {
    for (const id of ["downPct", "rate", "termYears"]) {
      expect(field(id).loanOnly).toBe(true);
      expect(EXAMPLE[id]).not.toBe("");
    }
    const financed = project({ ...EXAMPLE, amortType: "pi" }).r;
    expect(financed.loanAmount).toBe(400_000);
    expect(financed.dcr[1]).toBeGreaterThan(0);
  });

  it("clearing keeps the switches but empties the numbers", () => {
    expect(BLANK.purchasePrice).toBe("");
    expect(BLANK.amortType).toBe("cash");
    expect(BLANK.lossesNow).toBe("no");
  });
});

describe("value after renovation warning", () => {
  const warn = field("renoValue").warnFn!;

  it("flags a value below the purchase price", () => {
    const n = toNumbers({ ...EXAMPLE, renoValue: "280,000" });
    expect(warn(n)).toContain("$220,000 below the purchase price");
  });

  it("stays quiet when blank or at or above the price", () => {
    expect(warn(toNumbers(EXAMPLE))).toBeNull();
    expect(warn(toNumbers({ ...EXAMPLE, renoValue: "500,000" }))).toBeNull();
    expect(warn(toNumbers({ ...EXAMPLE, renoValue: "540,000" }))).toBeNull();
  });
});

describe("verdict", () => {
  it("says when the property never beats the comparison", () => {
    const values = { ...EXAMPLE, altReturn: "9" };
    const { n, r } = project(values);
    expect(verdict(n, r)).toContain("It would not beat 9% a year within five years.");
  });

  it("leaves the comparison out when it is switched off", () => {
    const { n, r } = project({ ...EXAMPLE, compareAlt: "off" });
    expect(verdict(n, r)).not.toContain("a year");
  });
});
