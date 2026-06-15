import { describe, it, expect } from "vitest";
import { OFFICES } from "./offices";

describe("OFFICES", () => {
  it("lists the three MSFG offices with full details", () => {
    expect(OFFICES.length).toBe(3);
    for (const o of OFFICES) {
      expect(o.city).toBeTruthy();
      expect(o.address).toBeTruthy();
      expect(o.phone).toBeTruthy();
    }
    expect(OFFICES.map((o) => o.city)).toContain("Westminster");
  });
});
