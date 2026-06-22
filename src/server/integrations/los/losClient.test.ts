import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock @/lib/env so serverEnv reads from process.env without triggering Zod
// validation (DATABASE_URL etc. not present in test environment).
vi.mock("@/lib/env", () => ({
  serverEnv: new Proxy({} as Record<string, string>, {
    get(_t, prop: string) {
      return process.env[String(prop).toUpperCase()] ?? undefined;
    },
  }),
  losConfigured: () => Boolean(process.env.LOS_API_BASE),
}));

// Mock @/lib/applyIntake (only types needed; no runtime import)
vi.mock("@/lib/applyIntake", () => ({}));

import {
  createLoanApplication,
  createLoanApplicationDev,
} from "./losClient";

const DUMMY_PAYLOAD = {} as Parameters<typeof createLoanApplication>[1];

const DEV_IDENTITY = {
  sub: "00000000-0000-0000-0000-0000000000b0",
  roles: "Borrower",
  org: "00000000-0000-0000-0000-0000000000aa",
};

beforeEach(() => {
  vi.stubEnv("LOS_API_BASE", "http://localhost:8080");
  vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: true,
    json: async () => ({ applicationId: "abc-uuid" }),
    text: async () => "",
  } as Response);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("createLoanApplication", () => {
  it("returns skipped when LOS_API_BASE is unset", async () => {
    vi.unstubAllEnvs(); // clears LOS_API_BASE
    const result = await createLoanApplication("tok", DUMMY_PAYLOAD);
    expect(result).toEqual({ ok: false, skipped: true });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns error when idToken is empty", async () => {
    const result = await createLoanApplication("", DUMMY_PAYLOAD);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/missing id_token/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("calls the LOS with Authorization Bearer header and returns applicationId", async () => {
    const result = await createLoanApplication("my-token", DUMMY_PAYLOAD);
    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/api\/loan-applications\/intake$/);
    const headers = init.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer my-token");
    expect(headers["X-Dev-Sub"]).toBeUndefined();
    expect(result).toEqual({ ok: true, applicationId: "abc-uuid" });
  });
});

describe("createLoanApplicationDev", () => {
  it("returns skipped when LOS_API_BASE is unset", async () => {
    vi.unstubAllEnvs();
    const result = await createLoanApplicationDev(DUMMY_PAYLOAD, DEV_IDENTITY);
    expect(result).toEqual({ ok: false, skipped: true });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("calls the LOS with X-Dev-* headers (no Authorization) and returns applicationId", async () => {
    const result = await createLoanApplicationDev(DUMMY_PAYLOAD, DEV_IDENTITY);
    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/api\/loan-applications\/intake$/);
    const headers = init.headers as Record<string, string>;
    expect(headers["X-Dev-Sub"]).toBe("00000000-0000-0000-0000-0000000000b0");
    expect(headers["X-Dev-Roles"]).toBe("Borrower");
    expect(headers["X-Dev-Org"]).toBe("00000000-0000-0000-0000-0000000000aa");
    expect(headers["Authorization"]).toBeUndefined();
    expect(result).toEqual({ ok: true, applicationId: "abc-uuid" });
  });

  it("handles a non-ok LOS response gracefully", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    } as Response);
    const result = await createLoanApplicationDev(DUMMY_PAYLOAD, DEV_IDENTITY);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(500);
  });
});
