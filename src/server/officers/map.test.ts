import { describe, it, expect } from "vitest";
import { rowToOfficer } from "./map";

describe("rowToOfficer", () => {
  it("maps a DB row to the Officer shape, defaulting nullables", () => {
    const officer = rowToOfficer({
      name: "Tanya Long",
      title: "Licensed Mortgage Broker",
      nmls: "1634834",
      email: "tanya.long@msfg.us",
      phone: "(701) 471-1687",
      licensedStates: ["CO", "MI", "MN", "ND", "SD", "TX"],
      bio: ["Para one."],
      photoUrl: "https://img/tl.jpeg",
      applyUrl: "https://apply/tl",
    });
    expect(officer).toEqual({
      slug: "tanya-long",
      name: "Tanya Long",
      title: "Licensed Mortgage Broker",
      nmls: "1634834",
      email: "tanya.long@msfg.us",
      phone: "(701) 471-1687",
      states: ["CO", "MI", "MN", "ND", "SD", "TX"],
      photo: "https://img/tl.jpeg",
      bio: ["Para one."],
      applyHref: "https://apply/tl",
    });
  });

  it("coerces null scalars to empty strings", () => {
    const o = rowToOfficer({
      name: "No Bio",
      title: null,
      nmls: "1",
      email: null,
      phone: null,
      licensedStates: [],
      bio: [],
      photoUrl: null,
      applyUrl: null,
    });
    expect(o.title).toBe("");
    expect(o.photo).toBe("");
    expect(o.applyHref).toBe("");
  });
});
