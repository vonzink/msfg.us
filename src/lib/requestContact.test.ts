import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { requestContact } from "./leads";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("crypto", { randomUUID: () => "fixed-uuid-0000000000" });
});
afterEach(() => vi.unstubAllGlobals());

describe("requestContact", () => {
  it("POSTs to the lead's contact-request route with channel + idempotencyKey", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    const out = await requestContact("row-1", "email");
    expect(out).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/v1/leads/row-1/contact-request");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body);
    expect(body.channel).toBe("email");
    expect(body.idempotencyKey).toBe("fixed-uuid-0000000000");
  });

  it("includes phone + consentTcpa when provided", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    await requestContact("row-1", "call", { phone: "3035551234", consentTcpa: true });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.phone).toBe("3035551234");
    expect(body.consentTcpa).toBe(true);
  });

  it("returns { ok: false } on a non-OK response (swallowed)", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 422, json: async () => ({ ok: false }) });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const out = await requestContact("row-1", "call");
    expect(out).toEqual({ ok: false });
    errSpy.mockRestore();
  });

  it("returns { ok: false } when fetch throws (swallowed)", async () => {
    fetchMock.mockRejectedValue(new Error("network"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const out = await requestContact("row-1", "text");
    expect(out).toEqual({ ok: false });
    errSpy.mockRestore();
  });
});
