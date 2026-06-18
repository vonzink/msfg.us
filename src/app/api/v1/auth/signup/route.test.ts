import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/cognito", () => ({ authConfigured: vi.fn(() => true) }));
vi.mock("@/lib/auth/cognitoIdp", () => ({ signUp: vi.fn() }));
vi.mock("@/server/api/rateLimit", () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true, limit: 60, remaining: 59, reset: 0, retryAfter: 0 })),
  clientIdentifier: () => "ip:test",
  rateLimitHeaders: () => ({}),
}));

import { POST } from "./route";
import * as cognito from "@/lib/auth/cognito";
import * as idp from "@/lib/auth/cognitoIdp";
import * as rl from "@/server/api/rateLimit";

const authConfigured = vi.mocked(cognito.authConfigured);
const signUp = vi.mocked(idp.signUp);
const checkRateLimit = vi.mocked(rl.checkRateLimit);

function req(body: unknown) {
  return new Request("http://x/api/v1/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  authConfigured.mockReturnValue(true);
  signUp.mockReset();
  checkRateLimit.mockReturnValue({ allowed: true, limit: 60, remaining: 59, reset: 0, retryAfter: 0 });
});

describe("POST /api/v1/auth/signup", () => {
  it("returns code_sent on success", async () => {
    signUp.mockResolvedValue({ ok: true, data: undefined });
    const res = await POST(req({ email: "a@b.com", password: "longenough" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, status: "code_sent" });
  });

  it("returns exists when the user already exists", async () => {
    signUp.mockResolvedValue({ ok: false, code: "UsernameExistsException", message: "exists" });
    const res = await POST(req({ email: "a@b.com", password: "longenough" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, status: "exists" });
  });

  it("surfaces the password policy message on InvalidPasswordException", async () => {
    signUp.mockResolvedValue({ ok: false, code: "InvalidPasswordException", message: "Password must contain a number" });
    const res = await POST(req({ email: "a@b.com", password: "longenough" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Password must contain a number");
  });

  it("400s on an invalid body", async () => {
    const res = await POST(req({ email: "not-an-email" }));
    expect(res.status).toBe(400);
  });

  it("429s when rate limited", async () => {
    checkRateLimit.mockReturnValue({ allowed: false, limit: 60, remaining: 0, reset: 0, retryAfter: 5 });
    const res = await POST(req({ email: "a@b.com", password: "longenough" }));
    expect(res.status).toBe(429);
  });

  it("503s when auth is not configured", async () => {
    authConfigured.mockReturnValue(false);
    const res = await POST(req({ email: "a@b.com", password: "longenough" }));
    expect(res.status).toBe(503);
  });

  it("503s when the IDP is unreachable", async () => {
    signUp.mockResolvedValue({ ok: false, code: "NetworkError", message: "offline" });
    const res = await POST(req({ email: "a@b.com", password: "longenough" }));
    expect(res.status).toBe(503);
  });
});
