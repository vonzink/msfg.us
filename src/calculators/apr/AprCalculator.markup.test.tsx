import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Values } from "../shared/fields";
import { AprCalculator } from "./AprCalculator";
import { BLANK, DETAIL_FIELDS, entryFaults, exampleValues, FRONT_FIELDS, toInput } from "./fields";
import { calculateApr } from "./math";
import { AprPrintDetails, AprPrintSummary } from "./PrintSummary";
import { AprResults, gapSentence, LOAN_ESTIMATE_LINE, MI_NOT_COUNTED, promptText, WHAT_APR_IS } from "./Results";

const NOTE = "An example interest rate, not an offer.";
const DISCLAIMER = "This is an estimate based on the numbers you entered.";
const page = () => renderToStaticMarkup(<AprCalculator exampleRatePct={7} exampleRateNote={NOTE} disclaimer={DISCLAIMER} />);
const typed = (changes: Values = {}): Values => ({ ...exampleValues(7), ...changes });
const results = (changes: Values = {}, from: Values = typed()) => {
  const values = { ...from, ...changes };
  const input = toInput(values);
  return renderToStaticMarkup(<AprResults input={input} result={calculateApr(input)} disclaimer={DISCLAIMER} faults={entryFaults(values)} />);
};
const print = (changes: Values = {}) => {
  const input = toInput(typed(changes));
  const result = calculateApr(input)!;
  return renderToStaticMarkup(
    <>
      <AprPrintSummary input={input} result={result} />
      <AprPrintDetails input={input} result={result} disclaimer={DISCLAIMER} />
    </>,
  );
};
const prompt = (changes: Values = {}, from: Values = typed()) => {
  const values = { ...from, ...changes };
  return promptText(toInput(values), entryFaults(values));
};
const gap = (changes: Values = {}) => gapSentence(calculateApr(toInput(typed(changes)))!);
const count = (html: string, needle: string) => html.split(needle).length - 1;

/** The rows of one small table, by the heading of its card: [label, value] as shown. */
const rows = (html: string, heading: string): [string, string][] => {
  const from = html.indexOf(`>${heading}</h2>`);
  expect(from, heading).toBeGreaterThan(-1);
  const card = html.slice(from, html.indexOf("</dl>", from));
  return [...card.matchAll(/<dt[^>]*>(.*?)<\/dt><dd[^>]*>(.*?)<\/dd>/g)].map((m) => [m[1], m[2]]);
};
const feeRows = (changes: Values = {}) => rows(results(changes), "Fees the APR counts");
const loanRows = (changes: Values = {}) => rows(results(changes), "The loan in numbers");
/** "$4,920.55" or "-$1,500.00" in cents. */
const inCents = (text: string) => Math.round(Number(text.replace(/[$,]/g, "")) * 100);

const NO_FEES: Values = { lenderFees: "0", prepaidInterest: "0" };
const CREDIT_LARGER: Values = { lenderCredit: "9,000" };
const WITH_MI: Values = { loanAmount: "380,000", homeValue: "400,000", rate: "6.75", lenderFees: "3,500", monthlyMi: "160" };
const MI_NOT_NEEDED: Values = { ...WITH_MI, loanAmount: "300,000" };
const ZERO_RATE: Values = { loanAmount: "200,000", rate: "0", lenderFees: "2,000" };
const STATES: Values[] = [{}, NO_FEES, CREDIT_LARGER, WITH_MI, MI_NOT_NEEDED, ZERO_RATE, { points: "1" }, { points: "2.5", lenderCredit: "1,500" }, { prepaidInterest: "1,800" }];

const BAD_OUTPUT = /NaN|Infinity|undefined|-\$0|-0\.0+%/;
const BAD_WORDS = /qualif|approved|eligible|your rate|your APR|should/i;
const FOLDER = path.join(process.cwd(), "src", "calculators", "apr");
/** The files that make the page: everything but the tests and the recorded golden cases. */
const SOURCES = fs.readdirSync(FOLDER).filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f));

describe("APR calculator page", () => {
  it("opens on the example: 7.154% beside a 7.000% interest rate", () => {
    const html = page();
    expect(html).toContain("Estimated APR");
    expect(html).toContain("7.154%");
    expect(html).toContain("Interest rate 7.000%");
    expect(html).toContain("The APR is 0.154 percentage points above the interest rate, because it counts $4,921 in fees.");
    expect(html).toContain("$2,129");
    expect(html).toContain("$920.55");
    expect(html).toContain("$4,920.55");
    expect(html).toContain("$315,079");
    expect(html).toContain("$451,349");
    expect(html).toContain(LOAN_ESTIMATE_LINE);
    expect(html).toContain(WHAT_APR_IS);
    expect(html).toContain(NOTE);
    expect(html).toContain(DISCLAIMER);
    expect(html).not.toContain('role="status"');
  });

  it("pins the sentences that keep the figure from reading as an offer", () => {
    expect(LOAN_ESTIMATE_LINE).toBe("This is an estimate. The official APR is the one on your Loan Estimate.");
    expect(WHAT_APR_IS).toBe(
      "APR is the yearly cost of a loan with certain fees counted in, not only the interest. It lets you compare loans that have different rates and fees. It does not change the monthly payment.",
    );
    // Beside the result, in semibold, in every state that has a result.
    for (const state of STATES) expect(results(state)).toMatch(new RegExp(`<p class="[^"]*font-semibold[^"]*">${LOAN_ESTIMATE_LINE}</p>`));
  });

  it("never prints a broken number, a banned word or a dash, whatever the state", () => {
    const states = [
      page(),
      ...STATES.map((s) => results(s)),
      ...STATES.map((s) => print(s)),
      results({}, BLANK), results({ loanAmount: "" }), results({ rate: "" }), results({ rate: "." }), results({ rate: "30" }), results({ rate: "-1" }),
      results({ loanAmount: "0" }), results({ loanAmount: "-5" }), results({ lenderFees: "400,000" }), results({ lenderFees: "319,000" }),
      results({ points: "11" }), results({ monthlyMi: "160" }), results({ lenderCredit: "-1" }),
      ...[...FRONT_FIELDS, ...DETAIL_FIELDS].filter((f) => f.type !== "choice").map((f) => results({ [f.id]: "abc" })),
      results({ loanAmount: "1", lenderFees: "0", prepaidInterest: "0" }), results({ loanAmount: "9,000,000,000" }),
      results({ lenderFees: "0.01", prepaidInterest: "0" }),
    ];
    for (const html of states) {
      expect(html).not.toMatch(BAD_OUTPUT);
      expect(html).not.toMatch(BAD_WORDS);
      expect(html).not.toMatch(/[—–]/);
    }
  });

  it("labels every typed field and gives the choice a legend", () => {
    const html = page();
    for (const f of [...FRONT_FIELDS, ...DETAIL_FIELDS]) {
      if (f.type === "choice") expect(html).toMatch(new RegExp(`<legend[^>]*>${f.label}</legend>`));
      else expect(html, f.id).toMatch(new RegExp(`<label for="apr-${f.id}"[^>]*>${f.label}</label>`));
    }
    expect(count(html, "<input id=")).toBe(8);
  });

  it("has two cards up front and one panel of detail", () => {
    const html = page();
    expect(html).toMatch(/<h2[^>]*>The loan<\/h2>/);
    expect(html).toMatch(/<h2[^>]*>Fees<\/h2>/);
    expect(count(html, "<details data-calc-panel")).toBe(1);
    const panel = html.slice(html.indexOf("<details data-calc-panel"), html.indexOf("</details>"));
    for (const f of DETAIL_FIELDS) expect(panel, f.id).toContain(`id="apr-${f.id}"`);
    for (const f of FRONT_FIELDS.filter((x) => x.type !== "choice")) expect(panel, f.id).not.toContain(`id="apr-${f.id}"`);
  });

  it("puts the tenant's note under the interest rate, tied to the box", () => {
    expect(page()).toMatch(new RegExp(`<input id="apr-rate"[^>]*aria-describedby="apr-rate-hint"[^>]*>.*<span id="apr-rate-hint"[^>]*>${NOTE}</span>`));
  });

  it("pins the headline to the bottom of a phone screen", () => {
    expect(page()).toMatch(/<a href="#apr-results"[^>]*max-\[980px\]:flex[^>]*print:hidden[^>]*>.*Estimated APR.*7\.154%/);
  });
});

describe("the headline", () => {
  it("shows the APR and the interest rate to three decimals", () => {
    expect(results()).toMatch(/Estimated APR<\/p><p[^>]*>7\.154%<\/p><p[^>]*>Interest rate 7\.000%<\/p>/);
    expect(results(WITH_MI)).toMatch(/>7\.274%<\/p><p[^>]*>Interest rate 6\.750%<\/p>/);
    expect(results(ZERO_RATE)).toMatch(/>0\.067%<\/p><p[^>]*>Interest rate 0\.000%<\/p>/);
    expect(results(NO_FEES)).toMatch(/>7\.000%<\/p><p[^>]*>Interest rate 7\.000%<\/p>/);
  });
});

describe("the gap sentence", () => {
  it("gives the gap in percentage points to three decimals, and the fees behind it", () => {
    expect(gap()).toBe("The APR is 0.154 percentage points above the interest rate, because it counts $4,921 in fees.");
    expect(gap({ points: "1" })).toBe("The APR is 0.257 percentage points above the interest rate, because it counts $8,121 in fees.");
    expect(gap(ZERO_RATE)).toBe("The APR is 0.067 percentage points above the interest rate, because it counts $2,000 in fees.");
  });

  it("names the months of mortgage insurance when some are counted", () => {
    expect(gap(WITH_MI)).toBe("The APR is 0.524 percentage points above the interest rate, because it counts $4,554 in fees and 139 months of mortgage insurance.");
    expect(gap(MI_NOT_NEEDED)).toBe("The APR is 0.143 percentage points above the interest rate, because it counts $4,332 in fees.");
    // The credit takes the fees to zero; the insurance alone is counted.
    expect(gap({ ...WITH_MI, lenderCredit: "9,000" })).toMatch(/^The APR is 0\.\d{3} percentage points above the interest rate, because it counts 139 months of mortgage insurance\.$/);
  });

  it("says the APR is the same as the interest rate when nothing is counted", () => {
    const same = "With no fees counted, the APR is the same as the interest rate.";
    expect(gap(NO_FEES)).toBe(same);
    expect(gap(CREDIT_LARGER)).toBe(same);
    expect(gap({ ...MI_NOT_NEEDED, ...NO_FEES })).toBe(same);
  });

  it("never says 0.000 percentage points above", () => {
    // One cent of fees on 320,000 is counted, and moves the APR by less than a thousandth of a point.
    const tiny = { lenderFees: "0.01", prepaidInterest: "0" };
    expect(gap(tiny)).toBe("To three decimals, the APR is the same as the interest rate.");
    for (const state of [...STATES, tiny]) {
      expect(results(state)).not.toContain("0.000 percentage points");
      expect(print(state)).not.toContain("0.000 percentage points");
    }
  });

  it("is on the page under the headline", () => {
    for (const state of STATES) expect(results(state)).toContain(gap(state));
  });
});

describe("the fees the APR counts", () => {
  it("lists the example line by line, in cents, prepaid interest included", () => {
    expect(feeRows()).toEqual([
      ["Lender fees", "$4,000.00"],
      ["Prepaid interest (15 days)", "$920.55"],
      ["Fees counted", "$4,920.55"],
    ]);
  });

  it("shows points only when above zero, as a percent of the loan", () => {
    expect(feeRows({ points: "1" })).toEqual([
      ["Lender fees", "$4,000.00"],
      ["Discount points (1% of the loan)", "$3,200.00"],
      ["Prepaid interest (15 days)", "$920.55"],
      ["Fees counted", "$8,120.55"],
    ]);
    expect(feeRows({ points: "0.125" })[1]).toEqual(["Discount points (0.125% of the loan)", "$400.00"]);
    expect(feeRows({ points: "0" }).map(([label]) => label)).toEqual(["Lender fees", "Prepaid interest (15 days)", "Fees counted"]);
  });

  it("says 15 days only when the prepaid interest is the automatic amount", () => {
    expect(feeRows({ prepaidInterest: "1,800" })).toEqual([
      ["Lender fees", "$4,000.00"],
      ["Prepaid interest", "$1,800.00"],
      ["Fees counted", "$5,800.00"],
    ]);
  });

  it("keeps a $0 line in sight", () => {
    expect(feeRows(NO_FEES)).toEqual([
      ["Lender fees", "$0.00"],
      ["Prepaid interest", "$0.00"],
      ["Fees counted", "$0.00"],
    ]);
    expect(feeRows(ZERO_RATE)).toEqual([
      ["Lender fees", "$2,000.00"],
      ["Prepaid interest (15 days)", "$0.00"],
      ["Fees counted", "$2,000.00"],
    ]);
  });

  it("takes a lender credit off, only when one is used", () => {
    expect(feeRows({ lenderCredit: "1,500" })).toEqual([
      ["Lender fees", "$4,000.00"],
      ["Prepaid interest (15 days)", "$920.55"],
      ["Lender credit", "-$1,500.00"],
      ["Fees counted", "$3,420.55"],
    ]);
    expect(results({ lenderCredit: "1,500" })).not.toContain("is not used here");
    expect(feeRows({ lenderCredit: "0" }).map(([label]) => label)).not.toContain("Lender credit");
  });

  it("uses a larger credit only as far as zero, and says what is left over", () => {
    expect(feeRows(CREDIT_LARGER)).toEqual([
      ["Lender fees", "$4,000.00"],
      ["Prepaid interest (15 days)", "$920.55"],
      ["Lender credit", "-$4,920.55"],
      ["Fees counted", "$0.00"],
    ]);
    const sentence = "$4,079.45 of the lender credit is not used here. A credit lowers these fees to zero at most.";
    expect(results(CREDIT_LARGER)).toContain(sentence);
    expect(print(CREDIT_LARGER)).toContain(sentence);
    // A credit does not come off points.
    expect(feeRows({ ...CREDIT_LARGER, points: "1" })).toEqual([
      ["Lender fees", "$4,000.00"],
      ["Discount points (1% of the loan)", "$3,200.00"],
      ["Prepaid interest (15 days)", "$920.55"],
      ["Lender credit", "-$4,920.55"],
      ["Fees counted", "$3,200.00"],
    ]);
  });

  it("adds up to the total shown, which is the figure the APR used", () => {
    for (const state of STATES) {
      const lines = feeRows(state);
      const [totalLabel, total] = lines[lines.length - 1];
      expect(totalLabel).toBe("Fees counted");
      const sum = lines.slice(0, -1).reduce((cents, [, value]) => cents + inCents(value), 0);
      expect(sum, JSON.stringify(state)).toBe(inCents(total));
      expect(inCents(total), JSON.stringify(state)).toBe(Math.round(calculateApr(toInput(typed(state)))!.fees.total * 100));
    }
  });
});

describe("the loan in numbers", () => {
  it("lists the rate, the APR, the payment, the amount financed and the finance charge", () => {
    expect(loanRows()).toEqual([
      ["Interest rate", "7.000%"],
      ["Estimated APR", "7.154%"],
      ["Monthly principal and interest", "$2,129"],
      ["Amount financed", "$315,079"],
      ["Finance charge over the loan", "$451,349"],
    ]);
  });

  it("adds mortgage insurance with its months when it is counted", () => {
    expect(loanRows(WITH_MI)).toEqual([
      ["Interest rate", "6.750%"],
      ["Estimated APR", "7.274%"],
      ["Monthly principal and interest", "$2,465"],
      ["Mortgage insurance", "$160 a month for 139 months"],
      ["Amount financed", "$375,446"],
      ["Finance charge over the loan", "$534,076"],
    ]);
  });
});

describe("mortgage insurance on a loan already at or under 78% of the home value", () => {
  it("shows the result and says the insurance is not counted, on screen and in print", () => {
    expect(MI_NOT_COUNTED).toBe("Mortgage insurance is not counted: the loan is already at or under 78% of the home value.");
    const html = results(MI_NOT_NEEDED);
    expect(html).toContain("6.893%");
    expect(html).toContain(MI_NOT_COUNTED);
    expect(loanRows(MI_NOT_NEEDED).map(([label]) => label)).not.toContain("Mortgage insurance");
    expect(print(MI_NOT_NEEDED)).toContain(MI_NOT_COUNTED);
    for (const state of [{}, WITH_MI, { homeValue: "400,000" }]) {
      expect(results(state)).not.toContain(MI_NOT_COUNTED);
      expect(print(state)).not.toContain(MI_NOT_COUNTED);
    }
  });
});

describe("no result", () => {
  const GENERAL = "Enter the loan amount and the interest rate to see the estimated APR.";
  const FEES = "The fees are too large for this loan amount to estimate an APR.";

  it("shows one sentence as a status, and no figure", () => {
    const html = results({}, BLANK);
    expect(html).toBe(`<div role="status" class="${html.match(/class="([^"]*)"/)![1]}">${GENERAL}</div>`);
  });

  it("asks for the loan amount and the interest rate while either is missing", () => {
    expect(prompt({}, BLANK)).toBe(GENERAL);
    expect(prompt({ loanAmount: "" })).toBe(GENERAL);
    expect(prompt({ rate: "" })).toBe(GENERAL);
    expect(prompt({ loanAmount: "0" })).toBe(GENERAL);
    // A missing box comes before junk in another.
    expect(prompt({ loanAmount: "", points: "abc" })).toBe(GENERAL);
  });

  it("names a box that holds something other than a number", () => {
    expect(prompt({ loanAmount: "abc" })).toBe("Enter a number for loan amount.");
    expect(prompt({ rate: "." })).toBe("Enter a number for interest rate.");
    expect(prompt({ rate: "7..5" })).toBe("Enter a number for interest rate.");
    expect(prompt({ lenderFees: "abc" })).toBe("Enter a number for lender fees, or leave it empty.");
    expect(prompt({ points: "abc" })).toBe("Enter a number for discount points, or leave it empty.");
    expect(prompt({ lenderCredit: "1..5" })).toBe("Enter a number for lender credit, or leave it empty.");
    expect(prompt({ monthlyMi: "abc" })).toBe("Enter a number for mortgage insurance, or leave it empty.");
    expect(prompt({ homeValue: "abc" })).toBe("Enter a number for home value, or leave it empty.");
    expect(prompt({ prepaidInterest: "abc" })).toBe("Enter a number for prepaid interest, or leave it empty.");
  });

  it("names a box that holds a negative number", () => {
    expect(prompt({ loanAmount: "-5" })).toBe("Loan amount must be $0 or more.");
    expect(prompt({ lenderFees: "-1" })).toBe("Lender fees must be $0 or more.");
    expect(prompt({ lenderCredit: "-1" })).toBe("Lender credit must be $0 or more.");
    expect(prompt({ monthlyMi: "-160", homeValue: "400,000" })).toBe("Mortgage insurance must be $0 or more.");
    expect(prompt({ homeValue: "-1" })).toBe("Home value must be $0 or more.");
    expect(prompt({ prepaidInterest: "-1" })).toBe("Prepaid interest must be $0 or more.");
    expect(prompt({ rate: "-1" })).toBe("Interest rate must be 0% or more.");
    expect(prompt({ points: "-1" })).toBe("Discount points must be 0% or more.");
    // Junk is named before a negative.
    expect(prompt({ lenderFees: "-1", prepaidInterest: "abc" })).toBe("Enter a number for prepaid interest, or leave it empty.");
  });

  it("names the range of the rate and of the points", () => {
    expect(prompt({ rate: "30" })).toBe("Interest rate must be from 0% to under 30%.");
    expect(prompt({ rate: "45" })).toBe("Interest rate must be from 0% to under 30%.");
    expect(prompt({ points: "10.5" })).toBe("Discount points must be between 0% and 10%.");
    expect(results({ rate: "29.99" })).not.toContain('role="status"');
    expect(results({ points: "10" })).not.toContain('role="status"');
  });

  it("asks for the home value when mortgage insurance is entered without one", () => {
    const sentence = "Enter the home value to count mortgage insurance. It decides when the insurance ends.";
    expect(prompt({ monthlyMi: "160" })).toBe(sentence);
    expect(prompt({ monthlyMi: "160", homeValue: "0" })).toBe(sentence);
    expect(results({ monthlyMi: "160" })).toContain(`role="status"`);
    expect(results({ monthlyMi: "160" })).not.toContain("Estimated APR");
    expect(results({ monthlyMi: "0" })).toContain("7.154%");
  });

  it("says so when the fees are too large for the loan", () => {
    expect(prompt({ lenderFees: "400,000" })).toBe(FEES);
    expect(prompt({ lenderFees: "320,000", prepaidInterest: "0" })).toBe(FEES);
    expect(prompt({ points: "10", lenderFees: "290,000" })).toBe(FEES);
    // So little is financed that the APR would be the solver's 100% ceiling.
    expect(prompt({ lenderFees: "319,000" })).toBe(FEES);
    expect(results({ lenderFees: "319,000" })).not.toContain("100.000%");
  });
});

describe("the printed page", () => {
  it("prints only what is below the form and the results", () => {
    const html = page();
    expect(html).toMatch(/<form[^>]*class="[^"]*print:hidden/);
    expect(html).toMatch(/<section id="apr-results"[^>]*class="[^"]*print:hidden/);
    expect(count(html, "APR estimate")).toBe(1);
    const printed = html.slice(html.indexOf('aria-label="Estimate summary"'));
    for (const text of ["APR estimate", "7.154%", "Fees the APR counts", "Fees counted", "$4,920.55", "$920.55", LOAN_ESTIMATE_LINE, DISCLAIMER]) expect(printed, text).toContain(text);
  });

  it("lists the loan beside the estimate, then the fees, the Loan Estimate sentence and the disclaimer", () => {
    const html = print();
    for (const text of [
      "The loan", "Loan amount", "$320,000", "Interest rate", "7.000%", "Loan term", "30 years", "Lender fees", "$4,000",
      "The estimate", "Estimated APR", "7.154%", "Above the interest rate", "0.154 percentage points", "Monthly principal and interest", "$2,129",
      "Amount financed", "$315,079", "Finance charge over the loan", "$451,349",
      "Prepaid interest (15 days)", "$920.55", "Fees counted", "$4,920.55",
      LOAN_ESTIMATE_LINE, DISCLAIMER,
    ]) expect(html, text).toContain(text);
    expect(html).not.toContain("Discount points");
    expect(html).not.toContain("Home value");
    // With no gap the row reads "None", never "0.000 percentage points".
    expect(print(NO_FEES)).toMatch(/<dt[^>]*>Above the interest rate<\/dt><dd[^>]*>None<\/dd>/);
  });

  it("lists the detail that is in use", () => {
    const html = print({ ...WITH_MI, points: "1", lenderCredit: "1,500" });
    for (const text of ["Discount points", "1%", "Lender credit", "$1,500", "Mortgage insurance", "$160 a month", "Home value", "$400,000", "$160 a month for 139 months"]) {
      expect(html, text).toContain(text);
    }
  });
});

describe("the source of the page", () => {
  it("has no call that stores or sends anything", () => {
    for (const file of SOURCES) {
      const source = fs.readFileSync(path.join(FOLDER, file), "utf8");
      expect(source, file).not.toMatch(/fetch\(|localStorage|sessionStorage|document\.cookie|sendBeacon|XMLHttpRequest|indexedDB|gtag|dataLayer/);
    }
    expect(SOURCES).toEqual(expect.arrayContaining(["AprCalculator.tsx", "Results.tsx", "PrintSummary.tsx", "fields.ts", "math.ts"]));
  });

  it("has no banned word or dash in its text", () => {
    for (const file of SOURCES) {
      const source = fs.readFileSync(path.join(FOLDER, file), "utf8");
      expect(source, file).not.toMatch(BAD_WORDS);
      expect(source, file).not.toMatch(/[—–]/);
    }
  });

  it("imports nothing from another calculator's folder", () => {
    for (const file of SOURCES) {
      const source = fs.readFileSync(path.join(FOLDER, file), "utf8");
      const imports = [...source.matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
      for (const from of imports) expect(from, file).toMatch(/^(\.\/|\.\.\/shared\/|@\/lib\/|react$|next\/)/);
    }
  });
});
