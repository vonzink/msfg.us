import { describe, it, expect, beforeEach } from "vitest";
import { checkRateLimit, __resetRateLimit } from "./rateLimit";

beforeEach(() => __resetRateLimit());

describe("checkRateLimit", () => {
  it("allows up to the max within the window", () => {
    for (let i = 0; i < 8; i++) {
      expect(checkRateLimit("k", 1000 + i).allowed).toBe(true);
    }
  });

  it("blocks the request over the max within the window", () => {
    for (let i = 0; i < 8; i++) checkRateLimit("k", 1000);
    expect(checkRateLimit("k", 1000).allowed).toBe(false);
  });

  it("allows again after the window slides", () => {
    for (let i = 0; i < 8; i++) checkRateLimit("k", 1000);
    expect(checkRateLimit("k", 1000 + 60_001).allowed).toBe(true);
  });

  it("scopes counters by key", () => {
    for (let i = 0; i < 8; i++) checkRateLimit("a", 1000);
    expect(checkRateLimit("b", 1000).allowed).toBe(true);
  });
});
