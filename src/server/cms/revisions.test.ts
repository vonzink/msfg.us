import { describe, it, expect } from "vitest";
import { nextVersion, findPublished, findDraft } from "./revisions";

const rev = (version: number, state: string) => ({ version, state });

describe("nextVersion", () => {
  it("returns 1 for no revisions", () => {
    expect(nextVersion([])).toBe(1);
  });
  it("returns max version + 1", () => {
    expect(nextVersion([rev(1, "ARCHIVED"), rev(3, "PUBLISHED"), rev(2, "DRAFT")])).toBe(4);
  });
});

describe("findPublished", () => {
  it("returns null when none published", () => {
    expect(findPublished([rev(1, "DRAFT")])).toBeNull();
  });
  it("returns the highest-version PUBLISHED revision", () => {
    const r = findPublished([rev(1, "PUBLISHED"), rev(2, "ARCHIVED"), rev(3, "PUBLISHED")]);
    expect(r?.version).toBe(3);
  });
});

describe("findDraft", () => {
  it("returns null when no draft", () => {
    expect(findDraft([rev(1, "PUBLISHED")])).toBeNull();
  });
  it("returns the highest-version DRAFT revision", () => {
    const r = findDraft([rev(1, "DRAFT"), rev(2, "DRAFT")]);
    expect(r?.version).toBe(2);
  });
});
