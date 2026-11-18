import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/cognito", () => ({
  authConfigured: vi.fn(() => true),
  verifyIdToken: vi.fn(async () => ({ sub: "s" })),
}));
vi.mock("@/lib/auth/cognitoIdp", () => ({ confirmSignUp: vi.fn(), initiateAuth: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ setSessionCookies: vi.fn() }));

import { POST } from "./route";
import * as cognito from "@/lib/auth/cognito";
import * as idp from "@/lib/auth/cognitoIdp";
import * as session from "@/lib/auth/session";

const authConfigured = vi.mocked(cognito.authConfigured);
const verifyIdToken = vi.mocked(cognito.verifyIdToken);
const confirmSignUp = vi.mocked(idp.confirmSignUp);
const initiateAuth = vi.mocked(idp.initiateAuth);
const setSessionCookies = vi.mocked(session.setSessionCookies);

function req(body: unknown) {
  return new Request("http://x/api/v1/auth/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const valid = { email: "a@b.com", password: "longenough", code: "123456" };

beforeEach(() => {
  authConfigured.mockReturnValue(true);
  verifyIdToken.mockResolvedValue({ sub: "s" } as unknown as Awaited<ReturnType<typeof verifyIdToken>>);
  confirmSignUp.mockReset();
  initiateAuth.mockReset();
  setSessionCookies.mockReset();
});

describe("POST /api/v1/auth/confirm", () => {
  it("confirms, signs in, and sets the session cookie (no access_token)", async () => {
    confirmSignUp.mockResolvedValue({ ok: true, data: undefined });
    initiateAuth.mockResolvedValue({ ok: true, data: { idToken: "id", accessToken: "ac", refreshToken: "rf" } });
    const res = await POST(req(valid));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(setSessionCookies).toHaveBeenCalledWith({ id_token: "id", refresh_token: "rf" });
  });

  it("400 code_mismatch on CodeMismatchException", async () => {
    confirmSignUp.mockResolvedValue({ ok: false, code: "CodeMismatchException", message: "" });
    const res = await POST(req(valid));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("code_mismatch");
    expect(initiateAuth).not.toHaveBeenCalled();
  });

  it("400 expired on ExpiredCodeException", async () => {
    confirmSignUp.mockResolvedValue({ ok: false, code: "ExpiredCodeException", message: "" });
    const res = await POST(req(valid));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("expired");
  });

  it("401 when sign-in after confirm fails", async () => {
    confirmSignUp.mockResolvedValue({ ok: true, data: undefined });
    initiateAuth.mockResolvedValue({ ok: false, code: "NotAuthorizedException", message: "" });
    const res = await POST(req(valid));
    expect(res.status).toBe(401);
  });

  it("400 on invalid body", async () => {
    const res = await POST(req({ email: "a@b.com", code: "123456" }));
    expect(res.status).toBe(400);
  });

  it("503s when the verification service is unreachable", async () => {
    confirmSignUp.mockResolvedValue({ ok: false, code: "NetworkError", message: "offline" });
    const res = await POST(req(valid));
    expect(res.status).toBe(503);
  });
});
