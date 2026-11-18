import { describe, it, expect } from "vitest";
import { signupSchema, confirmSchema, signinSchema, resendSchema } from "./auth";

describe("auth schemas", () => {
  it("normalizes email to lowercase + trims", () => {
    const r = signinSchema.safeParse({ email: "  A@B.COM ", password: "longenough" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.email).toBe("a@b.com");
  });

  it("rejects a short password", () => {
    expect(signinSchema.safeParse({ email: "a@b.com", password: "x" }).success).toBe(false);
  });

  it("confirm requires a numeric code and a password", () => {
    expect(confirmSchema.safeParse({ email: "a@b.com", password: "longenough", code: "abc" }).success).toBe(false);
    expect(confirmSchema.safeParse({ email: "a@b.com", code: "123456" }).success).toBe(false);
    expect(confirmSchema.safeParse({ email: "a@b.com", password: "longenough", code: "123456" }).success).toBe(true);
  });

  it("signup accepts optional names", () => {
    expect(signupSchema.safeParse({ email: "a@b.com", password: "longenough" }).success).toBe(true);
    expect(signupSchema.safeParse({ email: "a@b.com", password: "longenough", firstName: "Ann", lastName: "Bee" }).success).toBe(true);
  });

  it("resend needs only an email", () => {
    expect(resendSchema.safeParse({ email: "a@b.com" }).success).toBe(true);
    expect(resendSchema.safeParse({}).success).toBe(false);
  });
});
