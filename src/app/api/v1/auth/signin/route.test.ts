import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/cognito", () => ({
  authConfigured: vi.fn(() => true),
  verifyIdToken: vi.fn(async () => ({ sub: "s" })),
}));
vi.mock("@/lib/auth/cognitoIdp", () => ({ initiateAuth: vi.fn(), resendCode: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ setSessionCookies: vi.fn() }));
vi.mock("@/server/api/rateLimit", () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true, limit: 60, remaining: 59, reset: 0, retryAfter: 0 })),
  clientIdentifier: () => "ip:test",
  rateLimitHeaders: () => ({}),
}));

import { POST } from "./route";
import * as cognito from "@/lib/auth/cognito";
import * as idp from "@/lib/auth/cognitoIdp";
import * as session from "@/lib/auth/session";
import * as rl from "@/server/api/rateLimit";

const authConfigured = vi.mocked(cognito.authConfigured);
const initiateAuth = vi.mocked(idp.initiateAuth);
const resendCode = vi.mocked(idp.resendCode);
const setSessionCookies = vi.mocked(session.setSessionCookies);
const checkRateLimit = vi.mocked(rl.checkRateLimit);

function req(body: unknown) {
  return new Request("http://x/api/v1/auth/signin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const valid = { email: "a@b.com", password: "longenough" };

beforeEach(() => {
  authConfigured.mockReturnValue(true);
  initiateAuth.mockReset();
  resendCode.mockReset();
  setSessionCookies.mockReset();
  checkRateLimit.mockReturnValue({ allowed: true, limit: 60, remaining: 59, reset: 0, retryAfter: 0 });
});

describe("POST /api/v1/auth/signin", () => {
  it("signs in and sets the session cookie", async () => {
    initiateAuth.mockResolvedValue({ ok: true, data: { idToken: "id", accessToken: "ac", refreshToken: "rf" } });
    const res = await POST(req(valid));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(setSessionCookies).toHaveBeenCalledWith({ id_token: "id", refresh_token: "rf" });
  });

  it("returns unconfirmed and triggers a resend when the user isn't verified", async () => {
    initiateAuth.mockResolvedValue({ ok: false, code: "UserNotConfirmedException", message: "" });
    const res = await POST(req(valid));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, status: "unconfirmed" });
    expect(resendCode).toHaveBeenCalledWith({ email: "a@b.com" });
  });

  it("returns a uniform 401 on bad credentials (no enumeration)", async () => {
    initiateAuth.mockResolvedValue({ ok: false, code: "NotAuthorizedException", message: "" });
    const res = await POST(req(valid));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("invalid_credentials");
  });

  it("returns the same 401 for an unknown user", async () => {
    initiateAuth.mockResolvedValue({ ok: false, code: "UserNotFoundException", message: "" });
    const res = await POST(req(valid));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("invalid_credentials");
  });

  it("429s when rate limited", async () => {
    checkRateLimit.mockReturnValue({ allowed: false, limit: 60, remaining: 0, reset: 0, retryAfter: 5 });
    const res = await POST(req(valid));
    expect(res.status).toBe(429);
  });

  it("503s when the sign-in service is unreachable", async () => {
    initiateAuth.mockResolvedValue({ ok: false, code: "NetworkError", message: "offline" });
    const res = await POST(req(valid));
    expect(res.status).toBe(503);
  });
});
