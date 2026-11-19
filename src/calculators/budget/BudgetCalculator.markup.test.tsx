import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Values } from "../shared/fields";
import { BudgetCalculator } from "./BudgetCalculator";
import { BLANK, exampleValues, toInput } from "./fields";
import golden from "./golden.json";
import { calculateBudget, FRONT_BANDS, type BudgetInput } from "./math";
import { BudgetPrintDetails, BudgetPrintSummary } from "./PrintSummary";
import { BudgetResults, dialScale, headlineText, PRIVACY_LINE, promptText, RATIO_NOTE, shareText, usd, type FormState } from "./Results";
import { blankRows } from "./rows";

const DISCLAIMER = "This is an estimate based on the numbers you entered.";
const MORTGAGE = "/calculators/mortgage";
const page = (mortgageHref: string | null = MORTGAGE) => renderToStaticMarkup(<BudgetCalculator disclaimer={DISCLAIMER} mortgageHref={mortgageHref} />);
const goldenInput = (name: string) => golden.cases.find((c) => c.name === name)!.input as BudgetInput;
const results = (input: BudgetInput, form?: FormState) =>
  renderToStaticMarkup(<BudgetResults input={input} result={calculateBudget(input)} disclaimer={DISCLAIMER} form={form} />);
const typed = (changes: Values = {}) => toInput({ ...exampleValues(), ...changes }, blankRows());
const print = (input: BudgetInput) => {
  const result = calculateBudget(input)!;
  return renderToStaticMarkup(
    <>
      <BudgetPrintSummary input={input} result={result} />
      <BudgetPrintDetails groups={[{ heading: "Housing, line by line", lines: [{ label: "Property tax", amount: 400 }] }]} disclaimer={DISCLAIMER} />
    </>,
  );
};
const count = (html: string, needle: string) => html.split(needle).length - 1;
const bandWords = (html: string) => [...html.matchAll(/data-band="(\w+)"/g)].map((m) => m[1]);

const BAD_OUTPUT = /NaN|Infinity|undefined|-\$0|-0\.0+%/;
const BAD_WORDS = /qualif|approved|eligible|your rate|should|guideline|limit|DTI/i;
const BAR_HEADING = "Where the income goes";
const FOLDER = path.join(process.cwd(), "src", "calculators", "budget");
/** The files that make the page: everything but the tests and the recorded golden cases. */
const SOURCES = fs.readdirSync(FOLDER).filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f));

describe("home budget calculator page", () => {
  it("opens on the example: $1,220 left each month, both shares comfortable", () => {
    const html = page();
    expect(html).toContain("Estimated monthly cash flow");
    expect(html).toContain("$1,220 left each month");
    expect(html).toContain("after tax, housing, debts and living costs");
    expect(html).toContain("30.00%");
    expect(html).toContain("36.67%");
    expect(html).toContain("$5,700");
    expect(html).toContain("Housing as a share of income");
    expect(html).toContain("front-end ratio");
    expect(html).toContain("Housing and debts as a share of income");
    expect(html).toContain("back-end ratio");
    expect(html).toContain("Left after housing and debts");
    expect(html).toContain("monthly residual");
    expect(html).toContain(PRIVACY_LINE);
    expect(html).toContain(RATIO_NOTE);
    expect(html).toContain(DISCLAIMER);
    const shown = results(goldenInput("example"));
    expect(bandWords(shown)).toEqual(["comfortable", "comfortable"]);
    expect(count(shown, ">Comfortable<")).toBe(2);
  });

  it("pins the sentences that keep the page from reading as a loan decision", () => {
    expect(PRIVACY_LINE).toBe("Your numbers stay in this browser. They are not saved or sent anywhere.");
    expect(RATIO_NOTE).toBe(
      "These ratios are a way to see how much of your income is spoken for. A lender looks at more than these, and this page is not a loan decision.",
    );
  });

  it("never prints a broken number or a banned word, whatever the state", () => {
    const states = [
      page(), page(null),
      ...golden.cases.map((c) => results(c.input as BudgetInput)),
      ...golden.cases.map((c) => print(c.input as BudgetInput)),
      results(toInput(BLANK, blankRows())),
      results(typed({ grossIncome: "" })), results(typed({ taxRate: "abc" })), results(typed({ taxRate: "140" })),
      results(typed({ grossIncome: "0" })), results(typed({ housing: "-5" })),
      results(typed({ housingMode: "itemized" }), { itemized: ["housing"], savingsUnreadable: false }),
      results(typed(), { itemized: [], savingsUnreadable: true }),
      results(typed({ taxRate: "60", savingsRate: "40" })), results(typed({ taxRate: "100", savingsRate: "100" })),
      results(typed({ housing: "0", debts: "0", living: "0", taxRate: "0" })),
      results(typed({ grossIncome: "1", housing: "9,000,000" })),
      results({ ...goldenInput("example"), living: 2500 + 1219.6 }), results({ ...goldenInput("example"), living: 2500 + 1220.4 }),
    ];
    for (const html of states) {
      expect(html).not.toMatch(BAD_OUTPUT);
      expect(html).not.toMatch(BAD_WORDS);
      expect(html).not.toMatch(/[—–]/);
    }
  });

  it("shows the band word of each golden case, as text", () => {
    const word = (status: string) => (status.startsWith("Within") ? "comfortable" : status.startsWith("Above") ? "stretching" : "high");
    for (const c of golden.cases) {
      expect(bandWords(results(c.input as BudgetInput)), c.name).toEqual([word(c.expected.frontStatus), word(c.expected.backStatus)]);
    }
    expect(results(goldenInput("stretching"))).toContain(">Stretching<");
    expect(results(goldenInput("high"))).toContain(">High<");
    // Exactly on an edge is the band below it.
    expect(bandWords(results(goldenInput("band-edges")))).toEqual(["comfortable", "comfortable"]);
  });

  it("has no sentence of band ranges under the gauges, on screen or in print: the dial carries the edges", () => {
    for (const html of [page(), results(goldenInput("example")), results(goldenInput("high")), print(goldenInput("example"))]) {
      expect(html).not.toMatch(/Up to \d+% is|Above \d+%/);
      expect(html).not.toContain("is Comfortable");
      expect(html).not.toContain("is Stretching");
      expect(html).not.toContain("is High");
    }
    // The dial, its edge labels, the percent and the band word stay.
    const html = results(goldenInput("example"));
    expect(html).toContain(">32%</text>");
    expect(html).toContain(">55%</text>");
    expect(html).toContain("30.00%");
    expect(bandWords(html)).toEqual(["comfortable", "comfortable"]);
  });

  it("words a negative cash flow as short each month, with no bar and a sentence saying by how much", () => {
    const high = results(goldenInput("high"));
    expect(high).toContain("$750 short each month");
    expect(high).not.toContain("left each month");
    expect(high).not.toContain(BAR_HEADING);
    expect(high).toContain("On these numbers the month falls short by $750.");
    const over = results(goldenInput("expenses-over-income"));
    expect(over).toContain("$2,000 short each month");
    expect(over).not.toContain(BAR_HEADING);
  });

  it("never calls a few cents either way anything but $0 left", () => {
    expect(headlineText(-0.4)).toBe("$0 left each month");
    expect(headlineText(0.4)).toBe("$0 left each month");
    expect(headlineText(-0.6)).toBe("$1 short each month");
    expect(usd(-0.4)).toBe("$0");
  });

  it("shows where the income goes, each part with its amount and share, when the month is not short", () => {
    const html = results(goldenInput("with-savings-and-balances"));
    expect(html).toContain(BAR_HEADING);
    for (const part of ["Tax", "Savings", "Housing", "Debts", "Living costs", "Left over"]) expect(html, part).toContain(`>${part}<`);
    expect(html).toContain("$1,980");
    expect(html).toContain("22.0%");
    expect(html).toContain("$900");
    expect(html).toContain("10.0%");
    expect(html).toContain("$320");
    expect(html).toContain("3.6%");
    // A part of nothing is left off: the example sets nothing aside.
    expect(results(goldenInput("example"))).not.toContain(">Savings<");
  });

  it("colours a negative residual as a loss and keeps its label", () => {
    const input = { ...goldenInput("high"), debts: 3100 };
    const html = results(input);
    expect(html).toContain("-$700");
    expect(html).toContain("text-loss");
    expect(results(goldenInput("example"))).not.toContain("text-loss");
  });

  it("shows months of housing covered only with balances", () => {
    expect(results(goldenInput("example"))).not.toContain("Savings cover");
    const html = results(goldenInput("with-savings-and-balances"));
    expect(html).toContain("Savings cover");
    expect(html).toContain("9 months of housing");
    expect(results({ ...goldenInput("example"), balances: 2700 })).toContain("1 month of housing");
    expect(results({ ...goldenInput("example"), housing: 0, balances: 2700 })).not.toContain("Savings cover");
  });

  it("labels every typed field, gives each switch a legend, and has one details panel", () => {
    const html = page();
    const ids = [...html.matchAll(/<input[^>]*\bid="([^"]+)"/g)].map((m) => m[1]);
    expect(ids).toEqual(expect.arrayContaining(["budget-grossIncome", "budget-taxRate", "budget-housing", "budget-debts", "budget-living", "budget-savingsRate", "budget-balanceChecking"]));
    for (const id of ids) {
      expect(id.startsWith("budget-"), id).toBe(true);
      expect(html, id).toContain(`<label for="${id}"`);
    }
    expect(count(html, "<fieldset")).toBe(3);
    for (const legend of ["Enter housing as", "Enter debts as", "Enter living costs as"]) expect(html).toContain(`${legend}</legend>`);
    expect(count(html, "<details")).toBe(1);
    for (const heading of ["Income", "Each month", "Housing, line by line", "Debts, one by one", "Living costs, by category", "Savings"]) {
      expect(html, heading).toMatch(new RegExp(`<h[23][^>]*>${heading}</h[23]>`));
    }
  });

  it("links the housing box to the Mortgage calculator only when that one is on", () => {
    expect(page()).toMatch(/<a[^>]*href="\/calculators\/mortgage"[^>]*>Work this out/);
    expect(page(null)).not.toContain("Work this out");
  });

  it("C2: opens the Mortgage calculator in a new tab, and says so to a screen reader", () => {
    const link = page().match(/<a[^>]*href="\/calculators\/mortgage"[^>]*>.*?<\/a>/)![0];
    expect(link).toContain('target="_blank"');
    expect(link).toContain('rel="noopener noreferrer"');
    expect(link).toContain('Work this out<span class="sr-only"> with the mortgage calculator (opens in a new tab)</span>');
  });

  it("has a pinned bar for a phone: Left each month over the figure", () => {
    const html = page();
    expect(html).toContain('href="#budget-results"');
    expect(html).toContain("Left each month");
    expect(html).toContain("See results");
  });
});

describe("review fixes", () => {
  const SHORT_NOTE = "These shares are of income before tax. On these numbers the month still falls short once tax and living costs are counted.";

  it("B1: shows each share to two decimals, and the band always agrees with the figure shown", () => {
    expect(shareText(0.3)).toBe("30.00%");
    expect(shareText(11 / 30)).toBe("36.67%");
    expect(shareText(0)).toBe("0.00%");
    const upper = results({ ...goldenInput("example"), housing: 4233, debts: 0 });
    expect(upper).toContain("47.03%");
    expect(bandWords(upper)).toEqual(["high", "stretching"]);
    const edge = results({ ...goldenInput("example"), grossIncome: 5130, housing: 2411.1, debts: 0, living: 0 });
    expect(edge).toContain("47.00%");
    expect(bandWords(edge)).toEqual(["stretching", "comfortable"]);
  });

  it("B2: says under the gauges that the shares are before tax when the month is short", () => {
    const high = results(goldenInput("high"));
    expect(high).toContain(SHORT_NOTE);
    expect(high.indexOf(SHORT_NOTE)).toBeGreaterThan(high.indexOf("back-end ratio"));
    expect(high.indexOf(SHORT_NOTE)).toBeLessThan(high.indexOf("Left after housing and debts"));
    expect(results(goldenInput("example"))).not.toContain("These shares are of income before tax.");
    const noTax = results({ ...goldenInput("high"), taxRate: 0, living: 2000 });
    expect(noTax).toContain("These shares are of income before tax. On these numbers the month still falls short once living costs are counted.");
    expect(noTax).not.toContain("once tax and");
  });

  it("B3: the dial runs from Comfortable on the left to High on the right, with the band edges written on it", () => {
    expect(dialScale(FRONT_BANDS)).toEqual({ min: -1, fair: -0.47, good: -0.32, max: 0 });
    const html = results(goldenInput("example"));
    const dials = html.split("<svg").slice(1).map((s) => s.slice(0, s.indexOf("</svg>")));
    expect(dials).toHaveLength(2);
    // Zones are drawn left to right: green, amber, red.
    for (const dial of dials) expect([...dial.matchAll(/stroke-(chart-3|chart-4|loss)/g)].map((m) => m[1])).toEqual(["chart-3", "chart-4", "loss"]);
    expect([...dials[0].matchAll(/<text[^>]*>([^<]+)<\/text>/g)].map((m) => m[1])).toEqual(["32%", "47%"]);
    expect([...dials[1].matchAll(/<text[^>]*>([^<]+)<\/text>/g)].map((m) => m[1])).toEqual(["47%", "55%"]);
    // The needle moves to the right as the share rises.
    const angle = (h: string) => Number(h.match(/rotate\((-?[\d.]+)deg\)/)![1]);
    const low = angle(results({ ...goldenInput("example"), housing: 900 }));
    const mid = angle(results(goldenInput("example")));
    const top = angle(results(goldenInput("high")));
    expect(low).toBeLessThan(mid);
    expect(mid).toBeLessThan(0);
    expect(top).toBeGreaterThan(30);
    expect(angle(results({ ...goldenInput("example"), housing: 0 }))).toBe(-90);
  });

  it("B4: the front total of an itemized group is read-only, not disabled", () => {
    expect(page()).not.toMatch(/<input[^>]* (disabled|readonly)=""/i);
  });

  it("B5: names a negative entry, and says when a line is not a number", () => {
    const form = (more: Partial<FormState>): FormState => ({ itemized: ["housing"], savingsUnreadable: false, ...more });
    expect(promptText(typed({ housingMode: "itemized", housingTax: "-50" }), form({ negative: "Property tax" }))).toBe("Property tax must be $0 or more.");
    expect(promptText(typed(), { itemized: [], savingsUnreadable: false, negative: "Savings accounts" })).toBe("Savings accounts must be $0 or more.");
    expect(promptText(typed({ housingMode: "itemized", housingTax: "1..2" }), form({ unreadable: "housing" }))).toBe("One of the housing lines is not a number.");
    expect(promptText(typed({ debtsMode: "itemized" }), { itemized: ["debts"], savingsUnreadable: false, unreadable: "debts" })).toBe("One of the debts is not a number.");
    expect(promptText(typed({ livingMode: "itemized", livingOther: "x" }), { itemized: ["living"], savingsUnreadable: false, unreadable: "living" })).toBe("One of the living costs is not a number.");
    // Nothing entered at all is still the first prompt.
    expect(promptText(typed({ housingMode: "itemized" }), form({}))).toBe("Enter at least one housing line, or switch back to one total.");
  });

  it("B6: says what to enter as balances, and that a lender counts reserves in its own way", () => {
    expect(page()).toContain("Enter what would be left after your down payment and closing costs.");
    expect(results(goldenInput("with-savings-and-balances"))).toContain("A lender counts reserves in its own way, so this is not that figure.");
  });

  it("B7: never shows a negative share of nothing in the bar, and says the figures are rounded", () => {
    const html = results({ ...goldenInput("example"), living: 2500 + 1220.4 });
    expect(html).toContain(BAR_HEADING);
    expect(html).not.toContain("-0.0%");
    expect(html).toContain(">0.0%<");
    expect(html).toContain("Figures are rounded.");
  });
});

describe("with no result", () => {
  const prompt = (changes: Values, form?: FormState) => promptText(typed(changes), form);

  it("is a status, with no figure", () => {
    const html = results(toInput(BLANK, blankRows()));
    expect(html).toContain('role="status"');
    expect(html).not.toContain("$");
    expect(html).not.toContain(BAR_HEADING);
  });

  it("C1: asks only for the income and the housing payment", () => {
    expect(promptText(toInput(BLANK, blankRows()))).toBe(
      "Enter the gross monthly household income and the monthly housing payment to see what is left each month.",
    );
    expect(prompt({ grossIncome: "" })).toBe("Enter the gross monthly household income to see what is left each month.");
    expect(prompt({ housing: "" })).toBe("Enter the monthly housing payment to see what is left each month.");
    for (const html of [results(typed({ taxRate: "" })), results(typed({ debts: "", living: "" })), results(toInput({ ...BLANK, grossIncome: "9,000", housing: "2,700" }, blankRows()))]) {
      expect(html).not.toContain('role="status"');
      expect(html).toContain("left each month");
    }
    expect(results(toInput({ ...BLANK, grossIncome: "9,000", housing: "2,700" }, blankRows()))).toContain("$6,300 left each month");
  });

  it("C1: something unreadable in the tax rate, debts or living costs is named, never counted as 0", () => {
    expect(prompt({ taxRate: "2..2" })).toBe("Enter a number for the estimated tax rate, or leave it empty.");
    expect(prompt({ taxRate: "abc" })).toBe("Enter a number for the estimated tax rate, or leave it empty.");
    expect(prompt({ debts: "6oo" })).toBe("Enter a number for the monthly debt payments, or leave it empty.");
    expect(prompt({ living: "2..5" })).toBe("Enter a number for the monthly living costs, or leave it empty.");
    expect(results(typed({ living: "2..5" }))).toContain('role="status"');
  });

  it("C1: an itemized housing group with no line entered is named; debts and living costs with none count as $0", () => {
    expect(prompt({ housingMode: "itemized" }, { itemized: ["housing"], savingsUnreadable: false })).toBe("Enter at least one housing line, or switch back to one total.");
    expect(results(typed({ debtsMode: "itemized" }), { itemized: ["debts"], savingsUnreadable: false })).toContain("$1,820 left each month");
    expect(results(typed({ livingMode: "itemized" }), { itemized: ["living"], savingsUnreadable: false })).toContain("$3,720 left each month");
  });

  it("C1: the line under the headline and the notes name only the parts above zero", () => {
    const sub = (changes: Values) => results(typed(changes)).match(/text-on-dark-2">([^<]+)</)![1];
    expect(sub({})).toBe("after tax, housing, debts and living costs");
    expect(sub({ savingsRate: "10" })).toBe("after tax, savings, housing, debts and living costs");
    expect(sub({ taxRate: "", debts: "", living: "" })).toBe("after housing");
    expect(sub({ taxRate: "0", debts: "0" })).toBe("after housing and living costs");
    expect(sub({ taxRate: "", housing: "0", debts: "", living: "" })).toBe("with nothing taken off");
    // The month is short on housing and debts alone: no tax, no living costs.
    const short = results(typed({ grossIncome: "3,000", taxRate: "", housing: "2,700", debts: "600", living: "" }));
    expect(short).toContain("$300 short each month");
    expect(short).toContain("after housing and debts");
    expect(short).toContain("These shares are of income before tax. On these numbers the month falls short.");
    expect(short).not.toContain("once");
    expect(short).toContain("On these numbers the month falls short by $300. Housing and debts come to more than the income.");
    const savings = results(typed({ grossIncome: "3,000", taxRate: "", savingsRate: "20", housing: "2,700", debts: "", living: "" }));
    expect(savings).toContain("the month still falls short once savings are counted.");
    expect(savings).toContain("Savings and housing come to more than the income.");
    expect(results(goldenInput("high"))).toContain("On these numbers the month falls short by $750. Tax, housing, debts and living costs come to more than the income.");
  });

  it("names the field at fault and its range", () => {
    expect(prompt({ grossIncome: "0" })).toBe("Gross monthly household income must be above $0.");
    expect(prompt({ housing: "-5" })).toBe("Monthly housing payment must be $0 or more.");
    expect(prompt({ taxRate: "140" })).toBe("Estimated tax rate must be between 0% and 100%.");
    expect(prompt({ taxRate: "-1" })).toBe("Estimated tax rate must be between 0% and 100%.");
    expect(prompt({ savingsRate: "120" })).toBe("Share of income set aside as savings must be between 0% and 100%.");
  });

  it("asks for a number when the savings rate is unreadable, and shows no result", () => {
    expect(prompt({ savingsRate: "abc" }, { itemized: [], savingsUnreadable: true })).toBe(
      "Enter a number for the share of income set aside as savings, or leave it empty.",
    );
  });
});

describe("the printed page", () => {
  it("lists the month beside the estimate, then the lines, the note, the privacy line and the disclaimer", () => {
    const html = print(goldenInput("with-savings-and-balances"));
    expect(html).toContain("Home budget estimate");
    for (const text of [
      "The month", "Gross monthly household income", "$9,000", "Estimated tax rate", "22%", "Monthly housing payment", "$2,700",
      "Monthly debt payments", "$600", "Monthly living costs", "$2,500", "Share of income set aside as savings", "10%",
      "The estimate", "Left each month", "$320", "Housing as a share of income", "30.00%, Comfortable", "Housing and debts as a share of income", "36.67%, Comfortable",
      "Left after housing and debts", "$5,700", "Savings cover", "9 months of housing",
      "Housing, line by line", "Property tax", "$400",
      RATIO_NOTE, DISCLAIMER,
    ]) expect(html, text).toContain(text);
    const plain = print(goldenInput("example"));
    expect(plain).not.toContain("Savings cover");
    expect(plain).toContain("None");
    expect(print(goldenInput("high"))).toContain("Short each month");
  });

  it("B9: leaves the privacy line off the printed page; it is on screen once, under the form", () => {
    expect(print(goldenInput("example"))).not.toContain(PRIVACY_LINE);
    expect(count(page(), PRIVACY_LINE)).toBe(1);
  });

  it("prints only what is below the form and the results", () => {
    const html = page();
    expect(html).toContain("print:hidden");
    expect(count(html, "Home budget estimate")).toBe(1);
  });
});

describe("the privacy line is true", () => {
  it("has no call that stores or sends anything, in any file of this folder", () => {
    for (const file of fs.readdirSync(FOLDER).filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))) {
      const source = fs.readFileSync(path.join(FOLDER, file), "utf8");
      expect(source, file).not.toMatch(/fetch\(|localStorage|sessionStorage|document\.cookie|sendBeacon|XMLHttpRequest|indexedDB|gtag|dataLayer/);
    }
    expect(SOURCES).toEqual(expect.arrayContaining(["BudgetCalculator.tsx", "Results.tsx", "PrintSummary.tsx", "fields.ts", "math.ts", "rows.ts"]));
  });

  it("has no banned word or dash in the source text of the page's files", () => {
    for (const file of SOURCES) {
      const source = fs.readFileSync(path.join(FOLDER, file), "utf8");
      expect(source, file).not.toMatch(BAD_WORDS);
      expect(source, file).not.toMatch(/[—–]/);
    }
  });
});
