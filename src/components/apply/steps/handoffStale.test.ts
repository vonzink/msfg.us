import { describe, it, expect } from "vitest";
import { isHandoffTokenStale, HANDOFF_STALE_MS } from "./handoffStale";

describe("isHandoffTokenStale", () => {
  it("treats a null mintedAt (never warmed) as stale", () => {
    expect(isHandoffTokenStale(null, 1_000_000)).toBe(true);
  });

  it("is NOT stale for a freshly minted token", () => {
    const now = 1_000_000;
    expect(isHandoffTokenStale(now, now)).toBe(false);
  });

  it("is NOT stale just UNDER the 8-minute window", () => {
    const minted = 1_000_000;
    const now = minted + HANDOFF_STALE_MS - 1;
    expect(isHandoffTokenStale(minted, now)).toBe(false);
  });

  it("IS stale exactly AT the 8-minute window", () => {
    const minted = 1_000_000;
    const now = minted + HANDOFF_STALE_MS;
    expect(isHandoffTokenStale(minted, now)).toBe(true);
  });

  it("IS stale past the 8-minute window", () => {
    const minted = 1_000_000;
    const now = minted + HANDOFF_STALE_MS + 5_000;
    expect(isHandoffTokenStale(minted, now)).toBe(true);
  });

  it("honors a custom ttlMs override", () => {
    const minted = 1_000_000;
    expect(isHandoffTokenStale(minted, minted + 999, 1_000)).toBe(false);
    expect(isHandoffTokenStale(minted, minted + 1_000, 1_000)).toBe(true);
  });
});
