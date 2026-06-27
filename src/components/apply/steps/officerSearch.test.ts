import { describe, it, expect } from "vitest";
import { filterOfficersByName } from "./officerSearch";
import type { ApplyOfficer } from "./OfficerStep";

const o = (slug: string, name: string) => ({
  slug,
  name,
  title: "Loan Officer",
  nmls: "123456",
  states: ["CO"],
  photo: "/x.jpg",
  email: `${slug}@msfg.us`,
  phone: "3035551234",
});

const officers: ApplyOfficer[] = [
  o("zachary-zink", "Zachary Zink"),
  o("jane-doe", "Jane Doe"),
  o("john-smith", "John Smith"),
];

describe("filterOfficersByName", () => {
  it("returns the full list unchanged when the query is empty", () => {
    expect(filterOfficersByName(officers, "")).toEqual(officers);
  });

  it("returns the full list unchanged when the query is only whitespace", () => {
    expect(filterOfficersByName(officers, "   ")).toEqual(officers);
  });

  it("matches on a case-insensitive substring of the name", () => {
    const out = filterOfficersByName(officers, "ZACH");
    expect(out.map((x) => x.slug)).toEqual(["zachary-zink"]);
  });

  it("matches a substring anywhere in the name (not just the start)", () => {
    const out = filterOfficersByName(officers, "smith");
    expect(out.map((x) => x.slug)).toEqual(["john-smith"]);
  });

  it("rejects non-matching queries with an empty array", () => {
    expect(filterOfficersByName(officers, "zzz")).toEqual([]);
  });
});
