import { describe, expect, it } from "vitest";
import { downPaymentField, switchDownUnit } from "../shared/fields";
import {
  blank, BLANK, DETAIL_FIELDS, detailFields, exampleValues, FRONT_FIELDS, frontFields, inputFault, MODE_FIELD, scenarioOf, switchMode, TERM_YEARS, toInput,
  type Mode,
} from "./fields";
import golden from "./golden.json";
import { calculateMortgage, loanAmountForPayment } from "./math";

const start = { month: 0, year: 2027 };
const example = exampleValues(7);
const result = (changes: Record<string, string>) => calculateMortgage(toInput({ ...example, ...changes }, start));

describe("mortgage fields", () => {
  it("has six inputs up front (plus the down payment unit) and four behind Add detail", () => {
    expect(FRONT_FIELDS.map((f) => f.id)).toEqual(["homePrice", "downPayment", "downUnit", "rate", "termYears", "yearlyTax", "yearlyInsurance"]);
    expect(DETAIL_FIELDS.map((f) => f.id)).toEqual(["monthlyHoa", "monthlyPmi", "extraAmount", "extraFrequency"]);
  });

  it("opens with a worked example at the tenant's rate", () => {
    const input = toInput(example, start);
    expect(input).toMatchObject({ homePrice: 400000, downPayment: 80000, annualRate: 0.07, termYears: 30, yearlyTax: 4800, yearlyInsurance: 1800 });
    expect(exampleValues(6.5).rate).toBe("6.5");
    expect(calculateMortgage(input)!.monthlyPI).toBe(2128.97);
  });

  it("reads the down payment as dollars or as a percent of the price", () => {
    expect(toInput({ ...example, downUnit: "usd", downPayment: "50,000" }, start).downPayment).toBe(50000);
    expect(toInput({ ...example, downUnit: "pct", downPayment: "10" }, start).downPayment).toBe(40000);
  });

  it("clears to empty fields but keeps the choices and a 30-year term", () => {
    expect(BLANK.homePrice).toBe("");
    expect(BLANK.rate).toBe("");
    expect(BLANK.termYears).toBe("30"); // a typed box, but an empty term is never what a visitor means
    expect(BLANK.downUnit).toBe("pct");
    expect(BLANK.extraFrequency).toBe("monthly");
  });
});

describe("the shared down payment switch on this calculator's values", () => {
  it("keeps the same down payment in the model after a change of unit", () => {
    const dollars = switchDownUnit(example, "usd");
    expect(dollars).toMatchObject({ downUnit: "usd", downPayment: "80,000" });
    expect(toInput(dollars, start).downPayment).toBe(80000);
    expect(toInput(switchDownUnit(dollars, "pct"), start).downPayment).toBe(80000);
  });

  it("uses the shared down payment box up front", () => {
    expect(FRONT_FIELDS[1]).toEqual(downPaymentField("pct"));
  });
});

describe("junk in a field gives no result, never a crash", () => {
  it.each([
    ["letters for the price", { homePrice: "abc" }],
    ["an empty price", { homePrice: "" }],
    ["a down payment over 100%", { downPayment: "120" }],
    ["a down payment in dollars above the price", { downUnit: "usd", downPayment: "500,000" }],
    ["a 99% rate", { rate: "99" }],
    ["a negative rate", { rate: "-5" }],
    ["an empty rate", { rate: "" }],
    ["letters for the rate", { rate: "abc" }],
    ["a rate with two decimal points", { rate: "7..5" }],
    ["a rate that is only a decimal point so far", { rate: "." }],
    ["a negative down payment", { downPayment: "-5" }],
    ["a cleared form", BLANK],
  ])("%s", (_name, changes) => {
    expect(result(changes)).toBeNull();
  });

  it("treats junk in an optional field as zero", () => {
    // Principal and interest plus $150 a month of insurance; the tax and HOA entries are ignored.
    expect(result({ yearlyTax: "abc", monthlyHoa: "-50" })!.first.total).toBe(2278.97);
  });

  it("accepts a typed 0% rate", () => {
    expect(result({ rate: "0" })!.monthlyPI).toBe(888.89);
  });
});

const MODES: Mode[] = ["purchase", "refinance", "payment"];
const goldenCase = (name: string) => golden.cases.find((c) => c.name === name)!;
const refi = exampleValues(7, "refinance");
const pay = exampleValues(7, "payment");
const calc = (values: Record<string, string>) => calculateMortgage(toInput(values, start));

describe("the loan term is any whole number of years from 1 to 30", () => {
  it.each(MODES)("is a number box with a slider in %s mode", (mode) => {
    expect(frontFields(mode).find((f) => f.id === "termYears")).toEqual({
      id: "termYears", label: "Loan term", type: "num", suffix: "yr", example: "30", slider: { min: 1, max: 30, step: 1 },
    });
    expect(TERM_YEARS).toEqual({ min: 1, max: 30 });
  });

  it.each(["1", "7", "30"])("accepts a term of %s", (termYears) => {
    for (const mode of MODES) {
      const values = { ...exampleValues(7, mode), termYears };
      expect(inputFault(values), mode).toBeNull();
      expect(calc(values)!.schedule, mode).toHaveLength(Number(termYears) * 12);
    }
  });

  it.each([
    ["0", "range"], ["31", "range"], ["40", "range"], ["7.5", "range"], ["-3", "range"],
    ["abc", "unreadable"], ["1..5", "unreadable"], ["", "empty"],
  ])("rejects a term of \"%s\" and names the term", (termYears, problem) => {
    for (const mode of MODES) {
      const values = { ...exampleValues(7, mode), termYears };
      expect(calc(values), mode).toBeNull();
      const fault = inputFault(values)!;
      expect(fault.field.id, mode).toBe("termYears");
      expect(fault.field.label, mode).toBe("Loan term");
      expect(fault.problem, mode).toBe(problem);
      if (fault.problem === "range") expect(fault).toMatchObject({ min: 1, max: 30 });
    }
  });
});

describe("the three modes", () => {
  it("has a switch with a legend", () => {
    expect(MODE_FIELD).toEqual({
      id: "mode", label: "Calculation type", hideLabel: true, type: "choice", example: "purchase",
      options: [{ value: "purchase", label: "Purchase" }, { value: "refinance", label: "Refinance" }, { value: "payment", label: "Payment" }],
    });
  });

  it("shows each mode its own fields", () => {
    expect(frontFields("purchase")).toEqual(FRONT_FIELDS);
    expect(detailFields("purchase")).toEqual(DETAIL_FIELDS);
    expect(frontFields("refinance").map((f) => f.id)).toEqual(["loanAmount", "homeValue", "rate", "termYears", "yearlyTax", "yearlyInsurance"]);
    expect(detailFields("refinance").map((f) => f.id)).toEqual(["monthlyHoa", "monthlyPmi", "extraAmount", "extraFrequency"]);
    expect(frontFields("payment").map((f) => f.id)).toEqual(["payment", "rate", "termYears"]);
    expect(detailFields("payment").map((f) => f.id)).toEqual(["yearlyTax", "yearlyInsurance", "monthlyHoa", "monthlyPmi", "extraAmount", "extraFrequency"]);
  });

  it("gives payment mode the same tax, insurance and HOA boxes behind Add detail, and no home value", () => {
    const byId = Object.fromEntries(detailFields("payment").map((f) => [f.id, f]));
    for (const id of ["yearlyTax", "yearlyInsurance"]) expect(byId[id], id).toBe(frontFields("refinance").find((f) => f.id === id));
    expect(byId.monthlyHoa).toBe(detailFields("refinance").find((f) => f.id === "monthlyHoa"));
    expect(byId.monthlyPmi).toEqual({ id: "monthlyPmi", label: "Mortgage insurance", type: "money", example: "", hint: "Per month." });
    expect(byId.homeValue).toBeUndefined();
    expect([...frontFields("payment"), ...detailFields("payment")].some((f) => /home value/i.test(`${f.label} ${f.hint ?? ""}`))).toBe(false);
    expect(exampleValues(7, "payment")).toMatchObject({ yearlyTax: "", yearlyInsurance: "", monthlyHoa: "", monthlyPmi: "", homeValue: "" });
  });

  it("labels the new boxes", () => {
    const byId = (mode: Mode, id: string) => frontFields(mode).find((f) => f.id === id)!;
    expect(byId("refinance", "loanAmount")).toMatchObject({ label: "Loan amount", type: "money" });
    expect(byId("refinance", "homeValue")).toMatchObject({ label: "Home value", type: "money" });
    expect(byId("payment", "payment")).toEqual({ id: "payment", label: "Monthly payment", type: "money", example: "2,128.97", hint: "Principal and interest only." });
  });

  it("opens each mode on its example and keeps the mode", () => {
    expect(exampleValues(7)).toMatchObject({ mode: "purchase", homePrice: "400,000", downPayment: "20", downUnit: "pct", rate: "7", termYears: "30" });
    expect(exampleValues(7, "purchase")).toEqual(exampleValues(7));
    expect(refi).toMatchObject({ mode: "refinance", loanAmount: "320,000", homeValue: "400,000", rate: "7", termYears: "30", yearlyTax: "4,800", yearlyInsurance: "1,800" });
    expect(pay).toMatchObject({ mode: "payment", payment: "2,128.97", rate: "7", termYears: "30" });
    // $2,128.97 at 7% for 30 years gives back $320,000 (and 30 cents: see math.test.ts).
    expect(calc(pay)!.loanAmount).toBe(320000.3);
    expect(Math.round(calc(pay)!.loanAmount)).toBe(320000);
  });

  it("keeps the payment example on a $320,000 loan at another tenant's rate", () => {
    // $320,000 at 6.5% for 30 years is $2,022.62 a month.
    expect(exampleValues(6.5, "payment").payment).toBe("2,022.62");
    expect(Math.round(calc(exampleValues(6.5, "payment"))!.loanAmount)).toBe(320000);
  });

  it.each(MODES)("clears to empty boxes, a 30-year term, and stays in %s mode", (mode) => {
    const cleared = blank(mode);
    expect(cleared.mode).toBe(mode);
    expect(cleared).toMatchObject({ homePrice: "", loanAmount: "", homeValue: "", payment: "", rate: "", termYears: "30", downUnit: "pct", extraFrequency: "monthly" });
    expect(calc(cleared)).toBeNull();
    expect(BLANK).toEqual(blank("purchase"));
  });
});

describe("refinance", () => {
  it("gives the model the home value as the price and the equity as the down payment (the refi-80 golden input)", () => {
    expect(toInput(refi, start)).toEqual(goldenCase("refi-80").input);
    expect(calc(refi)!.monthlyPI).toBe(2128.97);
    expect(inputFault(refi)).toBeNull();
  });

  it("charges mortgage insurance above 80% of the home value (the refi-with-mi golden case)", () => {
    const values = { ...refi, loanAmount: "360,000", rate: "6.5", yearlyTax: "", yearlyInsurance: "", monthlyPmi: "150" };
    expect(toInput(values, start)).toEqual(goldenCase("refi-with-mi").input);
    const r = calc(values)!;
    expect(r.first.pmi).toBe(150);
    expect(r.pmiEndPayment).toBe(goldenCase("refi-with-mi").expected.pmiEndPayment);
  });

  it("counts no mortgage insurance without a home value, and the field says so", () => {
    const values = { ...refi, loanAmount: "360,000", homeValue: "", monthlyPmi: "150" };
    expect(inputFault(values)).toBeNull();
    const r = calc(values)!;
    expect(r.loanAmount).toBe(360000);
    expect(r.first.pmi).toBe(0);
    expect(r.schedule.every((row) => row.pmi === 0)).toBe(true);
    expect(r.first.total).toBe(r.monthlyPI + 400 + 150); // principal and interest, tax and homeowners insurance only

    const pmi = detailFields("refinance").find((f) => f.id === "monthlyPmi")!;
    expect(pmi.hintFn!({ monthlyPmi: 150, homeValue: 0 })).toBe("Per month. Not counted without a home value.");
    expect(pmi.hintFn!({ monthlyPmi: 150, homeValue: 400000 })).toBe("Per month. Counted only when the loan is above 80% of the home value.");
    expect(pmi.hintFn!({ monthlyPmi: 0, homeValue: 400000 })).toBe("Per month. Counted only when the loan is above 80% of the home value.");
    expect(pmi.hintFn!({ monthlyPmi: 0, homeValue: 0 })).toBe("Per month.");
  });

  it("gives the same loan with and without a home value when no insurance applies", () => {
    const withValue = calc(refi)!;
    const without = calc({ ...refi, homeValue: "" })!;
    expect(without.monthlyPI).toBe(withValue.monthlyPI);
    expect(without.totalInterest).toBe(withValue.totalInterest);
    expect(without.first.total).toBe(withValue.first.total);
  });

  it("gives no result for a home value below the loan and names the home value", () => {
    const values = { ...refi, homeValue: "300,000", monthlyPmi: "150" };
    expect(calc(values)).toBeNull();
    expect(inputFault(values)).toMatchObject({ field: { id: "homeValue", label: "Home value" }, problem: "below-loan" });
  });

  it("allows a loan for the whole home value", () => {
    const r = calc({ ...refi, loanAmount: "400,000", monthlyPmi: "150" })!;
    expect(r.loanAmount).toBe(400000);
    expect(r.first.pmi).toBe(150);
  });

  it("names the loan amount when it is missing or junk", () => {
    expect(inputFault({ ...refi, loanAmount: "" })).toMatchObject({ field: { id: "loanAmount" }, problem: "empty" });
    expect(inputFault({ ...refi, loanAmount: "abc" })).toMatchObject({ field: { id: "loanAmount" }, problem: "unreadable" });
    expect(inputFault({ ...refi, loanAmount: "0" })).toMatchObject({ field: { id: "loanAmount" }, problem: "not-positive" });
    expect(calc({ ...refi, loanAmount: "" })).toBeNull();
  });

  it("ignores what is left in the purchase boxes", () => {
    expect(toInput({ ...refi, homePrice: "900,000", downPayment: "50" }, start)).toEqual(toInput(refi, start));
  });
});

describe("payment", () => {
  it("gives the model the loan that the payment pays off", () => {
    const input = toInput(pay, start);
    const loan = loanAmountForPayment(2128.97, 0.07, 30)!;
    expect(input).toMatchObject({ homePrice: loan, downPayment: 0, annualRate: 0.07, termYears: 30 });
    const r = calc(pay)!;
    expect(r.loanAmount).toBe(loan);
    expect(r.monthlyPI).toBe(2128.97);
    expect(inputFault(pay)).toBeNull();
  });

  it("counts nothing on top while the detail boxes are empty", () => {
    expect(toInput(pay, start)).toMatchObject({ yearlyTax: 0, yearlyInsurance: 0, monthlyHoa: 0, monthlyPmi: 0 });
    expect(calc(pay)!.first).toEqual({ principalAndInterest: 2128.97, tax: 0, insurance: 0, hoa: 0, pmi: 0, total: 2128.97 });
  });

  const costs = { yearlyTax: "4,800", yearlyInsurance: "1,800", monthlyHoa: "100", monthlyPmi: "150" };

  it("adds tax, insurance, HOA dues and mortgage insurance on top: the payment typed stays principal and interest and the loan does not move", () => {
    const values = { ...pay, ...costs };
    expect(toInput(values, start)).toMatchObject({ yearlyTax: 4800, yearlyInsurance: 1800, monthlyHoa: 100, monthlyPmi: 150 });
    const r = calc(values)!;
    expect(r.loanAmount).toBe(calc(pay)!.loanAmount);
    expect(r.monthlyPI).toBe(2128.97);
    // 2,128.97 + 400 tax + 150 insurance + 100 HOA + 150 mortgage insurance
    expect(r.first).toEqual({ principalAndInterest: 2128.97, tax: 400, insurance: 150, hoa: 100, pmi: 150, total: 2928.97 });
    expect(r.totalInterest).toBe(calc(pay)!.totalInterest);
    expect(inputFault(values)).toBeNull();
  });

  // Hand-checked with a separate month-by-month script in exact decimals: on the $320,000.30 loan
  // at 7% for 30 years the balance first reaches 78% of the loan ($249,600.23) with payment 162,
  // and 78% of a $400,000 home ($312,000) with payment 29. Insurance is charged on the payments
  // before that one, as in the other modes.
  it("without a home value, counts mortgage insurance as if nothing were put down", () => {
    const values = { ...pay, monthlyPmi: "150" };
    expect(toInput(values, start)).toMatchObject({ homePrice: 320000.3, downPayment: 0, monthlyPmi: 150 });
    const r = calc(values)!;
    expect(r.pmiEndPayment).toBe(162);
    expect(r.schedule.filter((row) => row.pmi > 0)).toHaveLength(161);
    expect(r.schedule[160].pmi).toBe(150);
    expect(r.schedule[161].pmi).toBe(0);
    expect(r.schedule[160].balance).toBeGreaterThan(249600.23);
    expect(r.schedule[161].balance).toBeLessThanOrEqual(249600.23);
    expect(r.totalCost).toBe(Math.round((calc(pay)!.totalCost + 161 * 150) * 100) / 100);
  });

  it.each(["", "400,000", "500,000", "300,000", "abc", "0"])("ends the example's mortgage insurance at payment 162 whatever home value (%s) Refinance left behind", (homeValue) => {
    const values = { ...pay, monthlyPmi: "150", homeValue };
    expect(inputFault(values)).toBeNull();
    expect(toInput(values, start)).toMatchObject({ homePrice: 320000.3, downPayment: 0, monthlyPmi: 150 });
    const r = calc(values)!;
    expect(r.pmiEndPayment).toBe(162);
    expect(r.first.pmi).toBe(150);
    expect(r).toEqual(calc({ ...pay, monthlyPmi: "150" }));
  });

  it("keeps extra principal and the start month", () => {
    const input = toInput({ ...pay, extraAmount: "200", extraFrequency: "annually" }, { month: 5, year: 2030 });
    expect(input).toMatchObject({ extraAmount: 200, extraFrequency: "annually", startMonth: 5, startYear: 2030 });
  });

  it("works at 0% and for one year", () => {
    expect(calc({ ...pay, payment: "1,000", rate: "0", termYears: "1" })!.loanAmount).toBe(12000);
  });

  it("names the payment when it is missing, junk or zero, and the rate when that is the trouble", () => {
    expect(inputFault({ ...pay, payment: "" })).toMatchObject({ field: { id: "payment", label: "Monthly payment" }, problem: "empty" });
    expect(inputFault({ ...pay, payment: "abc" })).toMatchObject({ field: { id: "payment" }, problem: "unreadable" });
    expect(inputFault({ ...pay, payment: "0" })).toMatchObject({ field: { id: "payment" }, problem: "not-positive" });
    expect(inputFault({ ...pay, rate: "" })).toMatchObject({ field: { id: "rate", label: "Interest rate" }, problem: "empty" });
    expect(inputFault({ ...pay, rate: "26" })).toEqual({ field: frontFields("payment")[1], problem: "range", min: 0, max: 25 });
    const faulty: Record<string, string>[] = [{ payment: "" }, { payment: "abc" }, { payment: "0" }, { rate: "" }, { rate: "26" }];
    for (const changes of faulty) expect(calc({ ...pay, ...changes })).toBeNull();
  });
});

describe("what is wrong in purchase mode, for the prompt to name", () => {
  it("finds nothing wrong with the example", () => {
    expect(inputFault(example)).toBeNull();
  });

  it.each([
    ["an empty price", { homePrice: "" }, "homePrice", "empty"],
    ["letters for the price", { homePrice: "abc" }, "homePrice", "unreadable"],
    ["a down payment over 100%", { downPayment: "120" }, "downPayment", "not-below-price"],
    ["a down payment in dollars above the price", { downUnit: "usd", downPayment: "500,000" }, "downPayment", "not-below-price"],
    ["a negative down payment", { downPayment: "-5" }, "downPayment", "not-below-price"],
    ["an empty rate", { rate: "" }, "rate", "empty"],
    ["letters for the rate", { rate: "abc" }, "rate", "unreadable"],
    ["a 99% rate", { rate: "99" }, "rate", "range"],
    ["a negative rate", { rate: "-5" }, "rate", "range"],
  ])("%s", (_name, changes, id, problem) => {
    const fault = inputFault({ ...example, ...changes })!;
    expect(fault.field.id).toBe(id);
    expect(fault.problem).toBe(problem);
    expect(result(changes)).toBeNull();
  });

  it("names the first box at fault in page order", () => {
    expect(inputFault(BLANK)!.field.id).toBe("homePrice");
    expect(inputFault({ ...BLANK, homePrice: "400,000" })!.field.id).toBe("rate");
    expect(inputFault({ ...BLANK, homePrice: "400,000", rate: "7", termYears: "" })!.field.id).toBe("termYears");
    expect(inputFault({ ...BLANK, homePrice: "400,000", rate: "7" })).toBeNull(); // Clear leaves the term at 30
  });
});

describe("switching modes keeps what carries over", () => {
  const edited = { ...example, homePrice: "500,000", downPayment: "10", rate: "6.5", termYears: "13", yearlyTax: "6,000", monthlyHoa: "75", extraAmount: "100", extraFrequency: "annually" };
  const kept = { rate: "6.5", termYears: "13", yearlyTax: "6,000", yearlyInsurance: "1,800", monthlyHoa: "75", extraAmount: "100", extraFrequency: "annually" };

  it("does nothing when the mode does not change", () => {
    expect(switchMode(edited, "purchase", 7)).toBe(edited);
  });

  it("purchase to refinance: the loan is price minus down payment and the home value is the price", () => {
    const next = switchMode(edited, "refinance", 7);
    expect(next).toMatchObject({ mode: "refinance", loanAmount: "450,000", homeValue: "500,000", ...kept });
    // The same loan in the model, so no figure moves.
    expect(calc(next)!.loanAmount).toBe(calc(edited)!.loanAmount);
    expect(calc(next)!.first).toEqual(calc(edited)!.first);
    // The purchase boxes are kept for the way back.
    expect(switchMode(next, "purchase", 7)).toMatchObject({ mode: "purchase", homePrice: "500,000", downPayment: "10", downUnit: "pct", ...kept });
  });

  it("purchase to refinance with a down payment in dollars", () => {
    expect(switchMode({ ...edited, downUnit: "usd", downPayment: "125,000.50" }, "refinance", 7)).toMatchObject({ loanAmount: "374,999.5", homeValue: "500,000" });
  });

  it("keeps refinance numbers already typed, as the dashboard fills them on the first switch only", () => {
    const typed = { ...switchMode(edited, "refinance", 7), loanAmount: "300,000" };
    const back = switchMode(switchMode(typed, "purchase", 7), "refinance", 7);
    expect(back).toMatchObject({ loanAmount: "300,000", homeValue: "500,000" });
  });

  it("leaves the refinance boxes empty when the purchase boxes make no loan", () => {
    expect(switchMode({ ...edited, homePrice: "" }, "refinance", 7)).toMatchObject({ mode: "refinance", loanAmount: "", homeValue: "", ...kept });
    expect(switchMode({ ...edited, downPayment: "120" }, "refinance", 7)).toMatchObject({ loanAmount: "", homeValue: "" });
  });

  it("entering payment fills the payment with the current loan's principal and interest", () => {
    const fromPurchase = switchMode(edited, "payment", 7);
    const pi = calc(edited)!.monthlyPI;
    expect(fromPurchase).toMatchObject({ mode: "payment", ...kept });
    expect(Number(fromPurchase.payment.replace(/,/g, ""))).toBe(pi);
    expect(calc(fromPurchase)!.monthlyPI).toBe(pi);

    const fromRefi = switchMode({ ...refi, loanAmount: "250,000" }, "payment", 7);
    expect(fromRefi.payment).toBe("1,663.26"); // $250,000 at 7% for 30 years
    // A payment typed earlier is kept: the box is filled only when it is empty, like the other modes' boxes.
    expect(switchMode({ ...refi, yearlyTax: "5,000", payment: "9,999" }, "payment", 7).payment).toBe("9,999");
    const there = { ...switchMode({ ...example, homePrice: "500,000" }, "payment", 7), payment: "1,800" };
    expect(switchMode(switchMode(there, "purchase", 7), "payment", 7).payment).toBe("1,800");
  });

  it("entering payment without a loan keeps what the payment box held", () => {
    expect(switchMode({ ...edited, homePrice: "", payment: "1,500" }, "payment", 7)).toMatchObject({ mode: "payment", payment: "1,500" });
    expect(switchMode(BLANK, "payment", 7)).toMatchObject({ mode: "payment", payment: "", rate: "" });
  });

  it("leaving payment keeps the payment and fills an empty refinance loan with the loan it pays off", () => {
    const typed = { ...pay, payment: "2,500" };
    const next = switchMode(typed, "refinance", 7);
    expect(next).toMatchObject({ mode: "refinance", payment: "2,500", homeValue: "" });
    expect(Number(next.loanAmount.replace(/,/g, ""))).toBe(loanAmountForPayment(2500, 0.07, 30));
    // And back again: the same payment, not a cent lost.
    expect(switchMode(next, "payment", 7).payment).toBe("2,500");
  });

  it("refinance to purchase fills empty purchase boxes from the refinance", () => {
    const next = switchMode({ ...refi, loanAmount: "300,000", homeValue: "450,000" }, "purchase", 7);
    expect(next).toMatchObject({ mode: "purchase", homePrice: "450,000", downUnit: "usd", downPayment: "150,000" });
    expect(calc(next)!.loanAmount).toBe(300000);
    // Without a home value there is no price to give.
    expect(switchMode({ ...refi, loanAmount: "300,000", homeValue: "" }, "purchase", 7)).toMatchObject({ homePrice: "", downPayment: "", downUnit: "pct" });
  });

  it("carries tax, insurance, HOA dues and mortgage insurance into payment mode and back, and keeps the refinance home value for the way back", () => {
    const typed = { ...refi, loanAmount: "360,000", yearlyTax: "5,000", yearlyInsurance: "1,200", monthlyHoa: "75", monthlyPmi: "150" };
    const inPayment = switchMode(typed, "payment", 7);
    expect(inPayment).toMatchObject({ mode: "payment", yearlyTax: "5,000", yearlyInsurance: "1,200", monthlyHoa: "75", monthlyPmi: "150", homeValue: "400,000" });
    expect(calc(inPayment)!.first).toEqual(calc(typed)!.first);
    // The value is only stored: payment mode's model does not see it.
    expect(toInput(inPayment, start)).toMatchObject({ homePrice: calc(inPayment)!.loanAmount, downPayment: 0 });
    const changed = { ...inPayment, yearlyTax: "5,500" };
    expect(switchMode(changed, "refinance", 7)).toMatchObject({ mode: "refinance", loanAmount: "360,000", homeValue: "400,000", yearlyTax: "5,500", monthlyHoa: "75", monthlyPmi: "150" });
    expect(switchMode(changed, "purchase", 7)).toMatchObject({ mode: "purchase", yearlyTax: "5,500", yearlyInsurance: "1,200", monthlyHoa: "75", monthlyPmi: "150" });
  });

  it("refinance to purchase keeps the unit the visitor had when a percent says the same thing", () => {
    // The refinance example, touched: $320,000 on $400,000 is exactly 20% down.
    const touched = { ...refi, yearlyTax: "5,000" };
    expect(switchMode(touched, "purchase", 7)).toMatchObject({ homePrice: "400,000", downUnit: "pct", downPayment: "20" });
    expect(calc(switchMode(touched, "purchase", 7))!.loanAmount).toBe(320000);
    expect(switchMode({ ...touched, loanAmount: "385,000" }, "purchase", 7)).toMatchObject({ downUnit: "pct", downPayment: "3.75" });
    // A percent that does not come back to the same loan is given in dollars.
    expect(switchMode({ ...touched, loanAmount: "300,000", homeValue: "450,000" }, "purchase", 7)).toMatchObject({ downUnit: "usd", downPayment: "150,000" });
    // A visitor who had dollars keeps dollars.
    expect(switchMode({ ...touched, downUnit: "usd" }, "purchase", 7)).toMatchObject({ homePrice: "400,000", downUnit: "usd", downPayment: "80,000" });
    // A loan for the whole value is nothing down, in the unit they had.
    expect(switchMode({ ...touched, loanAmount: "400,000" }, "purchase", 7)).toMatchObject({ homePrice: "400,000", downUnit: "pct", downPayment: "" });
  });

  it("purchase to payment to refinance fills the home value from the price as well as the loan", () => {
    const next = switchMode(switchMode(edited, "payment", 7), "refinance", 7);
    expect(next.homeValue).toBe("500,000");
    expect(Math.abs(Number(next.loanAmount.replace(/,/g, "")) - 450000)).toBeLessThan(1);
    expect(calc(next)).not.toBeNull();
    // Not when the payment was raised past what the price covers, or a home value is already there.
    const raised = { ...switchMode(edited, "payment", 7), payment: "9,000" };
    expect(switchMode(raised, "refinance", 7).homeValue).toBe("");
    const valued = { ...switchMode(edited, "payment", 7), homeValue: "600,000" };
    expect(switchMode(valued, "refinance", 7).homeValue).toBe("600,000");
  });

  it("does not hang on an absurd price switched to payment, and asks for a smaller payment", () => {
    for (const homePrice of ["900,000,000,000,000", "9".repeat(25)]) {
      const next = switchMode({ ...edited, homePrice }, "payment", 7);
      expect(next.mode).toBe("payment");
      expect(calc(next)).toBeNull();
    }
    const next = switchMode({ ...edited, homePrice: "900,000,000,000,000" }, "payment", 7);
    expect(inputFault(next)).toMatchObject({ field: { id: "payment" }, problem: "range", max: 1000000 });
  }, 1000);

  it("an untouched example becomes the other mode's example", () => {
    for (const from of MODES) for (const to of MODES) {
      expect(switchMode(exampleValues(7, from), to, 7), `${from} to ${to}`).toEqual(exampleValues(7, to));
    }
  });

  it("never loses a number over a round trip through all three modes", () => {
    const round = switchMode(switchMode(switchMode(edited, "refinance", 7), "payment", 7), "purchase", 7);
    expect(round).toMatchObject({ mode: "purchase", homePrice: "500,000", downPayment: "10", downUnit: "pct", ...kept });
    expect(calc(round)!.first).toEqual(calc(edited)!.first);
  });
});

describe("what the results are told about the mode", () => {
  it("is a purchase by default", () => {
    expect(scenarioOf(exampleValues(7))).toEqual({ mode: "purchase" });
    expect(scenarioOf({})).toEqual({ mode: "purchase" });
  });

  it("says whether a refinance has a home value to measure the loan against", () => {
    expect(scenarioOf(exampleValues(7, "refinance"))).toEqual({ mode: "refinance", homeValueKnown: true });
    expect(scenarioOf({ ...exampleValues(7, "refinance"), homeValue: "" })).toEqual({ mode: "refinance", homeValueKnown: false });
    expect(scenarioOf({ ...exampleValues(7, "refinance"), homeValue: "abc" })).toEqual({ mode: "refinance", homeValueKnown: false });
  });

  it("carries the payment as typed, with the rate and the term, in payment mode", () => {
    expect(scenarioOf(exampleValues(7, "payment"))).toEqual({ mode: "payment", payment: 2128.97, annualRate: 0.07, termYears: 30 });
    // A home value left over from Refinance is not part of payment mode.
    expect(scenarioOf({ ...exampleValues(7, "payment"), homeValue: "400,000" })).toEqual({ mode: "payment", payment: 2128.97, annualRate: 0.07, termYears: 30 });
    expect(scenarioOf({ ...exampleValues(7, "payment"), payment: "1,500", termYears: "7" })).toMatchObject({ payment: 1500, termYears: 7 });
  });
});

describe("limits on the payment", () => {
  it.each(["1,000,000", "1,000,000.01", "600,000,000,000", "1,000,000,000,000,000"])("a payment of %s is out of range and gives no result", (payment) => {
    expect(inputFault({ ...pay, payment })).toMatchObject({ field: { id: "payment" }, problem: "range", max: 1000000 });
    expect(calc({ ...pay, payment })).toBeNull();
  }, 1000);

  it("a payment just under the limit works", () => {
    expect(inputFault({ ...pay, payment: "999,999.99" })).toBeNull();
    expect(calc({ ...pay, payment: "999,999.99" })).not.toBeNull();
  });

  it.each(["0.001", "0.01", "5", "6.65"])("a payment of %s pays off under 1,000 dollars and gives no result", (payment) => {
    expect(calc({ ...pay, payment })).toBeNull();
    expect(inputFault({ ...pay, payment })).toMatchObject({ field: { id: "payment" }, problem: "too-small" });
  });

  it("the smallest loan shown is $1,000", () => {
    // $1,000 at 7% for 30 years is $6.653 a month.
    expect(calc({ ...pay, payment: "6.66" })!.loanAmount).toBeGreaterThanOrEqual(1000);
    expect(inputFault({ ...pay, payment: "6.66" })).toBeNull();
    // The rate or the term is named first: without them there is no loan to measure.
    expect(inputFault({ ...pay, payment: "5", rate: "" })).toMatchObject({ field: { id: "rate" } });
  });
});

describe("an optional home value that cannot be used", () => {
  it.each<[Mode, string, string]>([
    ["refinance", "abc", "unreadable"],
    ["refinance", "4..5", "unreadable"],
    ["refinance", "0", "not-positive"],
    ["refinance", "-400,000", "not-positive"],
  ])("%s with a home value of %s: %s, and no result", (mode, homeValue, problem) => {
    const values = { ...exampleValues(7, mode), homeValue };
    expect(inputFault(values)).toMatchObject({ field: { id: "homeValue" }, problem });
    expect(calc(values)).toBeNull();
  });

  it("an empty home value in refinance is no fault", () => {
    expect(inputFault({ ...refi, homeValue: "" })).toBeNull();
    expect(inputFault({ ...refi, homeValue: "  " })).toBeNull();
  });

  it.each(["abc", "0", "-5", "300,000", "1"])("payment mode takes no notice of a home value of %s left in the form", (homeValue) => {
    expect(inputFault({ ...pay, homeValue })).toBeNull();
    expect(calc({ ...pay, homeValue })).toEqual(calc(pay));
  });

  it("does not trouble a purchase, which has no home value box", () => {
    expect(inputFault({ ...example, homeValue: "abc" })).toBeNull();
    expect(calc({ ...example, homeValue: "abc" })).not.toBeNull();
  });
});
