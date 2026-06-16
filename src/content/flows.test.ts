import { describe, it, expect } from "vitest";
import { FLOW } from "./flows";

describe("FLOW.buy refinements", () => {
  const buy = FLOW.buy;
  it("offers an 'Other' property type", () => {
    const pt = buy.find((s) => s.type === "choice" && s.field === "propertyType");
    expect(pt && "opts" in pt && pt.opts.some((o) => o.label === "Other")).toBe(true);
  });
  it("down payment is a toggle currency field named downPayment", () => {
    const dp = buy.find((s) => s.type === "currency" && "field" in s && s.field === "downPayment");
    expect(dp && "toggle" in dp && dp.toggle).toBe(true);
  });
  it("the address step carries an askPrompt", () => {
    const addr = buy.find((s) => s.type === "address");
    expect(addr && "askPrompt" in addr && Boolean(addr.askPrompt)).toBe(true);
  });
  it("includes a loan-officer step", () => {
    expect(buy.some((s) => s.type === "officer")).toBe(true);
  });
});
