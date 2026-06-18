import { describe, it, expect, vi } from "vitest";
import { signup, confirm, signin, resend } from "./accountPanelClient";

function fetcher(status: number, body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

describe("accountPanelClient", () => {
  it("signup posts to the signup route and returns the parsed status", async () => {
    const f = fetcher(200, { ok: true, status: "code_sent" });
    const res = await signup({ email: "a@b.com", password: "x" }, f as unknown as typeof fetch);
    expect(res).toEqual({ ok: true, status: "code_sent" });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("/api/v1/auth/signup");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ email: "a@b.com", password: "x" });
  });

  it("confirm carries email, password, and code", async () => {
    const f = fetcher(200, { ok: true });
    await confirm({ email: "a@b.com", password: "pw", code: "123456" }, f as unknown as typeof fetch);
    expect(JSON.parse((f.mock.calls[0][1] as RequestInit).body as string)).toEqual({
      email: "a@b.com",
      password: "pw",
      code: "123456",
    });
  });

  it("signin surfaces the unconfirmed status", async () => {
    const f = fetcher(200, { ok: true, status: "unconfirmed" });
    expect(await signin({ email: "a@b.com", password: "x" }, f as unknown as typeof fetch)).toEqual({
      ok: true,
      status: "unconfirmed",
    });
  });

  it("returns a network error when fetch throws", async () => {
    const f = vi.fn(async () => {
      throw new Error("offline");
    });
    expect(await resend({ email: "a@b.com" }, f as unknown as typeof fetch)).toEqual({ ok: false, error: "network" });
  });
});
