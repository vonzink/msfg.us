import { describe, expect, it } from "vitest";
import { BLANK, DETAIL_FIELDS, entryFaults, exampleValues, FRONT_FIELDS, toInput } from "./fields";
import golden from "./golden.json";
import { calculateApr } from "./math";

const example = exampleValues(7);
const goldenCase = (name: string) => golden.cases.find((c) => c.name === name)!;
const input = (changes: Record<string, string> = {}) => toInput({ ...example, ...changes });
const result = (changes: Record<string, string> = {}) => calculateApr(input(changes));
const ALL = [...FRONT_FIELDS, ...DETAIL_FIELDS];
const field = (id: string) => ALL.find((f) => f.id === id)!;
const pct3 = (rate: number) => Number((rate * 100).toFixed(3));
/** Every box that is typed into, in page order. */
const TYPED = ["loanAmount", "rate", "lenderFees", "points", "lenderCredit", "monthlyMi", "homeValue", "prepaidInterest"];

describe("APR fields", () => {
  it("has four inputs up front", () => {
    expect(FRONT_FIELDS.map((f) => [f.id, f.type, f.label])).toEqual([
      ["loanAmount", "money", "Loan amount"],
      ["rate", "pct", "Interest rate"],
      ["termYears", "choice", "Loan term"],
      ["lenderFees", "money", "Lender fees"],
    ]);
    expect(field("lenderFees").hint).toBe(
      "Fees charged by the lender to make the loan, such as origination, underwriting and processing, as one total. Leave out the appraisal, title and recording costs.",
    );
  });

  it("has five behind Add detail", () => {
    expect(DETAIL_FIELDS.map((f) => [f.id, f.type, f.label, f.hint])).toEqual([
      ["points", "pct", "Discount points", "As a percent of the loan amount."],
      ["lenderCredit", "money", "Lender credit", undefined],
      ["monthlyMi", "money", "Mortgage insurance", "Per month."],
      ["homeValue", "money", "Home value", "Needed to work out when mortgage insurance ends."],
      ["prepaidInterest", "money", "Prepaid interest", "Leave empty to use 15 days of interest."],
    ]);
  });

  it("offers terms of 10, 15, 20, 25 and 30 years, 30 to start", () => {
    expect(field("termYears").options!.map((o) => o.value)).toEqual(["10", "15", "20", "25", "30"]);
    expect(field("termYears").example).toBe("30");
  });

  it("keeps a typed 0 where the box is a money box and 0 is an answer", () => {
    expect(ALL.filter((f) => f.keepZero).map((f) => f.id)).toEqual(["lenderFees", "prepaidInterest"]);
  });

  it("opens with the example: 320,000 at the configured rate over 30 years with 4,000 of lender fees, the detail empty", () => {
    expect(example).toEqual({
      loanAmount: "320,000", rate: "7", termYears: "30", lenderFees: "4,000",
      points: "", lenderCredit: "", monthlyMi: "", homeValue: "", prepaidInterest: "",
    });
    expect(exampleValues(6.375).rate).toBe("6.375");
    expect(field("rate").example).toBe(""); // the rate is never a constant in this folder
  });

  it("the example at 7 is the golden example and gives its APR", () => {
    const { input: goldenInput, expected } = goldenCase("example");
    expect(goldenInput.prepaidInterest).toBeNull(); // automatic
    expect(input()).toEqual({ ...goldenInput, prepaidInterest: Number.NaN });
    const r = result()!;
    expect(pct3(r.apr)).toBe(expected.aprPct);
    expect(r.fees.total).toBe(expected.feesTotal);
    expect(r.amountFinanced).toBe(expected.amountFinanced);
  });

  it("the detail boxes give the other golden cases", () => {
    const typed: Record<string, Record<string, string>> = {
      points: { points: "1" },
      "credit-smaller": { lenderCredit: "1,500" },
      "credit-larger": { lenderCredit: "9,000" },
      "with-mi": { loanAmount: "380,000", homeValue: "400,000", rate: "6.75", lenderFees: "3,500", monthlyMi: "160" },
      "fifteen-year": { loanAmount: "250,000", rate: "6.25", termYears: "15", lenderFees: "3,000", points: "0.5" },
      "prepaid-typed": { prepaidInterest: "1,800" },
      "no-fees": { lenderFees: "0", prepaidInterest: "0" },
    };
    for (const [name, changes] of Object.entries(typed)) {
      const { input: goldenInput, expected } = goldenCase(name);
      expect(input(changes), name).toEqual({ ...goldenInput, prepaidInterest: goldenInput.prepaidInterest ?? Number.NaN });
      expect(pct3(result(changes)!.apr), name).toBe(expected.aprPct);
    }
  });

  it("Clear empties every typed box and keeps the term", () => {
    expect(BLANK).toEqual({
      loanAmount: "", rate: "", termYears: "30", lenderFees: "",
      points: "", lenderCredit: "", monthlyMi: "", homeValue: "", prepaidInterest: "",
    });
    expect(calculateApr(toInput(BLANK))).toBeNull();
    expect(entryFaults(BLANK)).toEqual({ unreadable: null, negative: null });
  });

  it("the loan amount and the rate have to be entered", () => {
    expect(result({ loanAmount: "" })).toBeNull();
    expect(result({ rate: "" })).toBeNull();
    expect(input({ loanAmount: "" }).loanAmount).toBeNaN();
    expect(input({ rate: "" }).rate).toBeNaN();
    // After Clear, the two alone are enough.
    const r = calculateApr(toInput({ ...BLANK, loanAmount: "320,000", rate: "7" }))!;
    expect(r.fees).toMatchObject({ lenderFees: 0, pointsAmount: 0, prepaidInterest: 920.55, lenderCreditApplied: 0, total: 920.55 });
    expect(r.miMonths).toBe(0);
  });

  it("a typed 0% rate is a rate", () => {
    expect(input({ rate: "0" }).rate).toBe(0);
    expect(result({ rate: "0" })).not.toBeNull();
  });

  it("empty lender fees, points, credit and mortgage insurance count as 0", () => {
    expect(input({ lenderFees: "" })).toMatchObject({ lenderFees: 0, points: 0, lenderCredit: 0, monthlyMi: 0, homeValue: 0 });
    expect(result({ lenderFees: "" })).toEqual(result({ lenderFees: "0" }));
    expect(result({ points: "0", lenderCredit: "0", monthlyMi: "0" })).toEqual(result());
    expect(result({ lenderFees: "   " })).toEqual(result({ lenderFees: "0" }));
  });

  it("empty prepaid interest is the automatic 15 days, and a typed 0 is 0", () => {
    expect(input().prepaidInterest).toBeNaN();
    expect(input({ prepaidInterest: "  " }).prepaidInterest).toBeNaN();
    expect(result()!.fees).toMatchObject({ prepaidInterest: 920.55, prepaidInterestIsAutomatic: true });
    expect(input({ prepaidInterest: "0" }).prepaidInterest).toBe(0);
    expect(result({ prepaidInterest: "0" })!.fees).toMatchObject({ prepaidInterest: 0, prepaidInterestIsAutomatic: false, total: 4000 });
    expect(result({ prepaidInterest: "$1,800.50" })!.fees.prepaidInterest).toBe(1800.5);
  });

  it("reads percents and amounts as typed", () => {
    expect(input({ rate: "6,75" }).rate).toBeCloseTo(0.0675, 12);
    expect(input({ rate: "7%" }).rate).toBeCloseTo(0.07, 12);
    expect(input({ points: "1.5" }).points).toBeCloseTo(0.015, 12);
    expect(input({ loanAmount: "$320,000" }).loanAmount).toBe(320000);
    expect(input({ termYears: "15" }).termMonths).toBe(180);
  });

  it.each(TYPED)("junk in %s is reported, is never 0 and gives no result", (id) => {
    for (const junk of ["abc", "2..5", "-", "1 2x"]) {
      const values = { ...example, monthlyMi: "160", homeValue: "400,000", [id]: junk };
      expect(entryFaults(values).unreadable?.id, junk).toBe(id);
      const model = toInput(values) as unknown as Record<string, number>;
      expect(model[id], junk).not.toBe(0);
      expect(Number.isFinite(model[id]), junk).toBe(false);
      expect(calculateApr(toInput(values)), junk).toBeNull();
    }
  });

  it("junk in prepaid interest is not taken as the automatic 15 days", () => {
    expect(input({ prepaidInterest: "abc" }).prepaidInterest).not.toBeNaN();
    expect(result({ prepaidInterest: "abc" })).toBeNull();
  });

  it.each(TYPED)("a negative %s is reported and gives no result", (id) => {
    const values = { ...example, monthlyMi: "160", homeValue: "400,000", [id]: "-5" };
    expect(entryFaults(values)).toEqual({ unreadable: null, negative: field(id) });
    expect(calculateApr(toInput(values))).toBeNull();
  });

  it("reports the first faulty box in page order, and nothing when all is well or empty", () => {
    expect(entryFaults(example)).toEqual({ unreadable: null, negative: null });
    expect(entryFaults({ ...example, points: "x", homeValue: "y", lenderCredit: "-1", prepaidInterest: "-2" })).toEqual({
      unreadable: field("points"), negative: field("lenderCredit"),
    });
    expect(entryFaults({ ...example, rate: "0", lenderFees: "0", prepaidInterest: "0" })).toEqual({ unreadable: null, negative: null });
  });

  it("mortgage insurance without a home value gives no result, and with one it does", () => {
    expect(result({ monthlyMi: "160" })).toBeNull();
    expect(entryFaults({ ...example, monthlyMi: "160" })).toEqual({ unreadable: null, negative: null }); // not junk: the page asks for the home value
    expect(result({ monthlyMi: "160", homeValue: "0" })).toBeNull();
    expect(result({ monthlyMi: "160", homeValue: "340,000" })!.miMonths).toBeGreaterThan(0);
    expect(result({ homeValue: "400,000" })).toEqual(result()); // a home value alone changes nothing
  });
});
