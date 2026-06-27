import { describe, it, expect } from "vitest";
import { leadToContactInput } from "./mappers";

const lead = {
  firstName: "Z",
  lastName: "Z",
  email: "z@x.com",
  phone: "3035551234",
  source: "apply-wizard",
  intent: "REFI",
  location: null,
} as unknown as Parameters<typeof leadToContactInput>[0];

describe("leadToContactInput contact-request tags", () => {
  it("keeps the base tags when no options are passed", () => {
    const out = leadToContactInput(lead);
    expect(out.tags).toEqual(["MSFG Web", "intent:REFI"]);
  });

  it("appends Requested:<channel> when requestedChannel is given", () => {
    const out = leadToContactInput(lead, { requestedChannel: "call" });
    expect(out.tags).toEqual(["MSFG Web", "intent:REFI", "Requested:call"]);
  });

  it("appends officer:<slug> when officerSlug is given", () => {
    const out = leadToContactInput(lead, { requestedChannel: "text", officerSlug: "robert-hoff" });
    expect(out.tags).toEqual([
      "MSFG Web",
      "intent:REFI",
      "Requested:text",
      "officer:robert-hoff",
    ]);
  });
});
