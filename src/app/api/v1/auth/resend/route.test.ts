import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/cognito", () => ({ authConfigured: vi.fn(() => true) }));
vi.mock("@/lib/auth/cognitoIdp", () => ({ resendCode: vi.fn() }));

import { POST } from "./route";
import * as cognito from "@/lib/auth/cognito";
import * as idp from "@/lib/auth/cognitoIdp";

const authConfigured = vi.mocked(cognito.authConfigured);
const resendCode = vi.mocked(idp.resendCode);

function req(body: unknown) {
  return new Request("http://x/api/v1/auth/resend", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  authConfigured.mockReturnValue(true);
  resendCode.mockReset();
});

describe("POST /api/v1/auth/resend", () => {
  it("returns ok on success", async () => {
    resendCode.mockResolvedValue({ ok: true, data: undefined });
    const res = await POST(req({ email: "a@b.com" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("429s on LimitExceededException", async () => {
    resendCode.mockResolvedValue({ ok: false, code: "LimitExceededException", message: "" });
    const res = await POST(req({ email: "a@b.com" }));
    expect(res.status).toBe(429);
  });

  it("400s on an invalid body", async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(400);
  });
});
