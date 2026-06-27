import { describe, it, expect } from "vitest";
import { telHref, smsHref } from "./offRampLink";

describe("offRampLink deep-link guards", () => {
  it("builds a tel: href for a real phone", () => {
    expect(telHref("(720) 838-1246")).toBe("tel:+17208381246");
  });

  it("returns null for an empty phone (no bare '+')", () => {
    expect(telHref("")).toBeNull();
    expect(telHref("   ")).toBeNull();
  });

  it("builds an sms: href for a real phone", () => {
    expect(smsHref("(720) 838-1246")).toBe("sms:+17208381246");
  });

  it("returns null sms: for an empty phone", () => {
    expect(smsHref("")).toBeNull();
  });
});
