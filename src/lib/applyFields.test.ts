import { describe, expect, it } from "vitest";
import { buildLeadFields, parseCurrency, formatCurrency, parsePercent } from "./applyFields";
import { FLOW, type Step } from "@/content/flows";

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
