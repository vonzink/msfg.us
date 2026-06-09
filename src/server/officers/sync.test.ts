import { describe, it, expect } from "vitest";
import { planOfficerSync } from "./sync";
import type { Officer } from "@/content/officers";

const mk = (nmls: string, states: string[] = ["CO"]): Officer => ({
  slug: "x",
  name: "X " + nmls,
  title: "Broker",
  nmls,
  email: "",
  phone: "",
  states,
  photo: "",
  bio: [],
  applyHref: "",
});

describe("planOfficerSync", () => {
  it("upserts every parsed officer with sortOrder by position", () => {
    const plan = planOfficerSync([mk("1"), mk("2")], []);
    expect(plan.upserts.map((u) => u.nmls)).toEqual(["1", "2"]);
    expect(plan.upserts[1].data.sortOrder).toBe(1);
    expect(plan.upserts[0].data.active).toBe(true);
    expect(plan.deactivateNmls).toEqual([]);
  });

  it("deactivates existing officers absent from the parsed roster", () => {
    const plan = planOfficerSync([mk("1")], ["1", "9"]);
    expect(plan.deactivateNmls).toEqual(["9"]);
  });

  it("maps states to licensedStates + primary state", () => {
    const plan = planOfficerSync([mk("1", ["TX", "CO"])], []);
    expect(plan.upserts[0].data.licensedStates).toEqual(["TX", "CO"]);
    expect(plan.upserts[0].data.state).toBe("TX");
  });
});
