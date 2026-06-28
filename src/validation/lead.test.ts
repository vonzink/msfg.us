import { describe, it, expect } from "vitest";
import { contactRequestSchema } from "./lead";

describe("contactRequestSchema", () => {
  it("accepts a minimal email request (channel only)", () => {
    const r = contactRequestSchema.safeParse({ channel: "email" });
    expect(r.success).toBe(true);
  });

  it("accepts a call request with a recaptured phone + consent", () => {
    const r = contactRequestSchema.safeParse({
      channel: "call",
      phone: "3035551234",
      consentTcpa: true,
      idempotencyKey: "abc-1234567890-xyz", // ≥16 chars
    });
    expect(r.success).toBe(true);
  });

  it("accepts an empty-string phone (treated as no recapture)", () => {
    const r = contactRequestSchema.safeParse({ channel: "text", phone: "" });
    expect(r.success).toBe(true);
  });

  it("rejects an unknown channel", () => {
    const r = contactRequestSchema.safeParse({ channel: "fax" });
    expect(r.success).toBe(false);
  });

  it("rejects a too-short non-empty phone", () => {
    const r = contactRequestSchema.safeParse({ channel: "call", phone: "123" });
    expect(r.success).toBe(false);
  });

  it("rejects a missing channel", () => {
    const r = contactRequestSchema.safeParse({ phone: "3035551234" });
    expect(r.success).toBe(false);
  });

  it("does NOT enforce the consent gate at the schema layer (consent is a route-level 422)", () => {
    // The schema allows call+phone with no consent; the ROUTE returns 422.
    const r = contactRequestSchema.safeParse({ channel: "call", phone: "3035551234" });
    expect(r.success).toBe(true);
  });
});
