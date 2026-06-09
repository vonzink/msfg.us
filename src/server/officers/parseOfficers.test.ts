import { describe, it, expect } from "vitest";
import { parseOfficerMarkdown, slugify } from "./parseOfficers";

const SAMPLE = `# Mountain State Financial Group, LLC — Loan Officers

Company NMLS: 1314257

---

## Robert Hoff, CFA
**Title:** President
**NMLS:** 608235
**Email:** robert.hoff@msfg.us
**Phone:** (720) 838-1246
**Licensed:** CO, ND

![Robert Hoff](https://images.example.com/rh.jpeg)

**Bio:**
First paragraph here.

Second paragraph here.

**Apply Now:** https://www.blink.mortgage/app/signup/p/x

---

## Sandra Simental
**Title:** Mortgage Broker
**NMLS:** 283846
**Email:** sandra.simental@msfg.us
**Phone:** (720) 290-8826
**Licensed:** CO

![Sandra Simental](https://images.example.com/ss.jpeg)

**Bio:**
_No bio available on the website (no individual profile page)._

**Apply Now:** https://www.blink.mortgage/app/signup/p/y
`;

describe("slugify", () => {
  it("drops credential suffix and hyphenates", () => {
    expect(slugify("Robert Hoff, CFA")).toBe("robert-hoff");
  });
});

describe("parseOfficerMarkdown", () => {
  const officers = parseOfficerMarkdown(SAMPLE);

  it("parses one entry per H2 officer block (ignores the H1 title)", () => {
    expect(officers).toHaveLength(2);
    expect(officers.map((o) => o.nmls)).toEqual(["608235", "283846"]);
  });

  it("extracts all scalar fields", () => {
    const o = officers[0];
    expect(o).toMatchObject({
      slug: "robert-hoff",
      name: "Robert Hoff, CFA",
      title: "President",
      nmls: "608235",
      email: "robert.hoff@msfg.us",
      phone: "(720) 838-1246",
      photo: "https://images.example.com/rh.jpeg",
      applyHref: "https://www.blink.mortgage/app/signup/p/x",
    });
  });

  it("splits Licensed into an uppercase states array", () => {
    expect(officers[0].states).toEqual(["CO", "ND"]);
  });

  it("collects bio paragraphs, dropping the 'no bio' placeholder", () => {
    expect(officers[0].bio).toEqual(["First paragraph here.", "Second paragraph here."]);
    expect(officers[1].bio).toEqual([]);
  });

  it("skips an H2 block that has no NMLS line", () => {
    const md =
      "## Random Heading\n**Title:** Not an officer\n\n## Real Person\n**NMLS:** 999\n**Licensed:** CO\n";
    expect(parseOfficerMarkdown(md).map((o) => o.nmls)).toEqual(["999"]);
  });
});
