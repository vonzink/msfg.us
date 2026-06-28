import { describe, expect, it } from "vitest";
import { buildLeadFields, parseCurrency, formatCurrency, parsePercent, isCurrencyAmount, reformatAmount, formatPhone } from "./applyFields";
import { FLOW, type Step } from "@/content/flows";
import type { AnswerValue } from "@/lib/leads";

const STEPS: Step[] = [
  { type: "multi", q: "Goals?", field: "goals", opts: [] },
  { type: "address", q: "Address?", field: "address" },
  { type: "choice", q: "Use?", field: "propertyUse", opts: [] },
  { type: "currency", q: "Value?", field: "homeValue" },
  { type: "currency", q: "Income?", field: "income", optional: true },
  { type: "form", q: "Contact" },
];

describe("parseCurrency", () => {
  it("strips formatting to a number", () => {
    expect(parseCurrency("$485,000")).toBe(485000);
    expect(parseCurrency("485000")).toBe(485000);
  });
  it("returns null for empty/garbage", () => {
    expect(parseCurrency("")).toBeNull();
    expect(parseCurrency("abc")).toBeNull();
  });
});

describe("formatCurrency", () => {
  it("groups thousands; null → empty", () => {
    expect(formatCurrency(485000)).toBe("485,000");
    expect(formatCurrency(null)).toBe("");
  });
});

describe("buildLeadFields", () => {
  it("maps answers to each step's field key, skipping empties and fieldless steps", () => {
    const answers = {
      0: ["Lower my monthly payment", "Take cash out"],
      1: { line1: "9035 Wadsworth Pkwy", city: "Broomfield", state: "CO", zip: "80021" },
      2: "Primary residence",
      3: 485000,
      4: null,
    };
    expect(buildLeadFields(STEPS, answers)).toEqual({
      goals: ["Lower my monthly payment", "Take cash out"],
      address: { line1: "9035 Wadsworth Pkwy", city: "Broomfield", state: "CO", zip: "80021" },
      propertyUse: "Primary residence",
      homeValue: 485000,
    });
  });
  it("omits a field whose answer is an empty string", () => {
    expect(buildLeadFields([{ type: "choice", q: "x", field: "propertyUse", opts: [] }], { 0: "" })).toEqual({});
  });
});

describe("refi flow — loan-officer step", () => {
  const refi = FLOW.refi;
  const officerIdx = refi.findIndex((s) => s.type === "officer");
  const formIdx = refi.findIndex((s) => s.type === "form");

  it("places the officer step before the contact form, so the choice is captured on the initial lead", () => {
    expect(officerIdx).toBeGreaterThanOrEqual(0);
    expect(formIdx).toBeGreaterThanOrEqual(0);
    expect(officerIdx).toBeLessThan(formIdx);
  });

  it("captures the chosen officer as the loanOfficer lead field", () => {
    const answers = { [officerIdx]: "zachary-zink" };
    expect(buildLeadFields(refi, answers).loanOfficer).toBe("zachary-zink");
  });
});

describe("CurrencyAmount in buildLeadFields", () => {
  const steps = [
    { type: "currency", q: "Down?", field: "downPayment", toggle: true, unit: "%" },
  ] as unknown as Step[];

  it("formats a percent amount as a labeled string", () => {
    const out = buildLeadFields(steps, { 0: { value: 20, unit: "%" } as AnswerValue });
    expect(out.downPayment).toBe("20%");
  });
  it("formats a dollar amount with thousands + $", () => {
    const out = buildLeadFields(steps, { 0: { value: 85000, unit: "$" } as AnswerValue });
    expect(out.downPayment).toBe("$85,000");
  });
  it("skips an amount whose value is null", () => {
    const out = buildLeadFields(steps, { 0: { value: null, unit: "%" } as AnswerValue });
    expect(out.downPayment).toBeUndefined();
  });
  it("isCurrencyAmount distinguishes shapes", () => {
    expect(isCurrencyAmount({ value: 1, unit: "%" })).toBe(true);
    expect(isCurrencyAmount(20)).toBe(false);
    expect(isCurrencyAmount({ line1: "x", city: "", state: "", zip: "" })).toBe(false);
  });
});

describe("parsePercent", () => {
  it("strips non-digits to a number", () => {
    expect(parsePercent("20%")).toBe(20);
    expect(parsePercent("5")).toBe(5);
  });
  it("clamps to 0–100", () => {
    expect(parsePercent("150")).toBe(100);
    expect(parsePercent("0")).toBe(0);
  });
  it("returns null for empty/garbage", () => {
    expect(parsePercent("")).toBeNull();
    expect(parsePercent("abc")).toBeNull();
  });
});

describe("reformatAmount", () => {
  it("groups thousands and parks the caret at the end when typing left-to-right", () => {
    expect(reformatAmount("450000", 6, "$")).toEqual({ text: "450,000", value: 450000, caret: 7 });
    expect(reformatAmount("120000", 6, "$")).toEqual({ text: "120,000", value: 120000, caret: 7 });
  });

  it("keeps the caret beside the just-typed digit on a mid-string insert", () => {
    // displayed "1,234", caret after "1", user types "5" → raw "15,234" caret 2
    expect(reformatAmount("15,234", 2, "$")).toEqual({ text: "15,234", value: 15234, caret: 2 });
  });

  it("shifts the caret across a newly inserted thousands separator", () => {
    // displayed "999", caret at end, user types "9" → raw "9999" caret 4
    expect(reformatAmount("9999", 4, "$")).toEqual({ text: "9,999", value: 9999, caret: 5 });
  });

  it("places the caret at the start when no digits precede it", () => {
    expect(reformatAmount("abc", 0, "$")).toEqual({ text: "", value: null, caret: 0 });
  });

  it("handles percent units with clamping and no separators", () => {
    expect(reformatAmount("20", 2, "%")).toEqual({ text: "20", value: 20, caret: 2 });
    expect(reformatAmount("150", 3, "%")).toEqual({ text: "100", value: 100, caret: 3 });
  });

  it("round-trips: re-feeding its own output is a fixed point", () => {
    const a = reformatAmount("360000", 6, "$");
    const b = reformatAmount(a.text, a.caret, "$");
    expect(b.text).toBe(a.text);
    expect(b.value).toBe(a.value);
  });
});

describe("formatPhone", () => {
  it("formats a full 10-digit number as XXX-XXX-XXXX", () => {
    expect(formatPhone("3035551234")).toBe("303-555-1234");
  });
  it("formats progressively as digits arrive", () => {
    expect(formatPhone("303")).toBe("303");
    expect(formatPhone("3035")).toBe("303-5");
    expect(formatPhone("303555")).toBe("303-555");
    expect(formatPhone("3035551")).toBe("303-555-1");
  });
  it("strips existing punctuation and reformats", () => {
    expect(formatPhone("(303) 555-1234")).toBe("303-555-1234");
  });
  it("caps at 10 digits", () => {
    expect(formatPhone("303555123499")).toBe("303-555-1234");
  });
  it("returns empty for blank/garbage", () => {
    expect(formatPhone("")).toBe("");
    expect(formatPhone("abc")).toBe("");
  });
});
