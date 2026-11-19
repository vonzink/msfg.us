// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MortgageCalculator } from "./MortgageCalculator";

// Today is pinned so the first payment is December 2026.
vi.useFakeTimers({ toFake: ["Date"] });
vi.setSystemTime(new Date(2026, 10, 18));

afterEach(cleanup);

const NOT_A_LENDING_AMOUNT = "This is arithmetic on the payment you typed. It is not the amount a lender would lend.";
const BAD_OUTPUT = /NaN|Infinity|undefined|-\$0|\$-/;
const BAD_WORDS = /qualif|approved|eligible|your rate|afford|should/i;
const DASHES = /[\u2013\u2014]/;

const open = () => render(<MortgageCalculator exampleRatePct={7} exampleRateNote="Example rate." disclaimer="Estimate only." />);
const mode = (name: "Purchase" | "Refinance" | "Payment") => fireEvent.click(screen.getByRole("radio", { name }));
const chosen = (name: string) => (screen.getByRole("radio", { name }) as HTMLInputElement).checked;
const box = (label: string) => screen.getByRole("textbox", { name: label, hidden: true }) as HTMLInputElement;
const hasBox = (label: string) => screen.queryByRole("textbox", { name: label, hidden: true }) !== null;
/** Types into a box and leaves it, as a visitor does. */
const type = (label: string, text: string) => {
  const input = box(label);
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: text } });
  fireEvent.blur(input);
};
const press = (name: string) => fireEvent.click(screen.getByRole("button", { name }));
const status = () => screen.queryByRole("status")?.textContent ?? null;
const results = () => document.getElementById("mortgage-results")!.textContent!;
const form = () => screen.getByRole("form", { name: "Loan details" });
const firstCard = () => Array.from(form().querySelector("section")!.querySelectorAll("label[for], legend"), (x) => x.textContent);
const detailLabels = () => Array.from(form().querySelector("details")!.querySelectorAll("label[for], legend"), (x) => x.textContent);
const printed = () => document.querySelector('section[aria-label="Estimate summary"]')!.textContent!;
const phoneBar = () => screen.getByRole("link", { name: /See results/ }).textContent!;
const yearRows = () => document.querySelectorAll('section[aria-label="Amortization schedule"] button[aria-expanded]').length;
const slider = () => document.getElementById("mortgage-breakdown-month") as HTMLInputElement;
const clean = () => {
  const all = document.body.textContent!;
  expect(all).not.toMatch(BAD_OUTPUT);
  expect(all).not.toMatch(BAD_WORDS);
  expect(all).not.toMatch(DASHES);
};

describe("the three modes", () => {
  it("opens on Purchase with the switch first in the form", () => {
    open();
    expect(chosen("Purchase")).toBe(true);
    expect(form().firstElementChild!.querySelector("legend")!.textContent).toBe("Calculation type");
    expect(form().firstElementChild!.querySelector("legend")!.className).toBe("sr-only");
    expect(document.body.textContent).not.toContain("I want to work out");
    expect(firstCard()).toEqual(["Home price", "Down payment", "Down payment as", "Interest rate", "Loan term", "Property tax", "Homeowners insurance"]);
    expect(results()).toContain("Estimated monthly payment$2,679$2,129 principal and interest on a $320,000 loan.");
    expect(phoneBar()).toContain("Monthly payment$2,679");
    clean();
  });

  it("Refinance asks for the loan amount and the home value, and gives the same headline", () => {
    open();
    mode("Refinance");
    expect(chosen("Refinance")).toBe(true);
    expect(firstCard()).toEqual(["Loan amount", "Home value", "Interest rate", "Loan term", "Property tax", "Homeowners insurance"]);
    expect(box("Loan amount").value).toBe("320,000");
    expect(box("Home value").value).toBe("400,000");
    expect(results()).toContain("Estimated monthly payment$2,679$2,129 principal and interest on a $320,000 loan.");
    expect(phoneBar()).toContain("Monthly payment$2,679");
    expect(printed()).toContain("Loan amount$320,000Home value$400,000Interest rate7%Loan term30 yearsFirst paymentDec 2026Property tax$4,800 a year");
    expect(printed()).not.toMatch(/Home price|Down payment/);
    expect(yearRows()).toBe(30);
    clean();
  });

  it("Payment asks for the payment, the rate and the term, and gives the loan amount", () => {
    open();
    mode("Payment");
    expect(chosen("Payment")).toBe(true);
    expect(firstCard()).toEqual(["Monthly payment", "Interest rate", "Loan term"]);
    expect(box("Monthly payment").value).toBe("2,128.97");
    expect(results()).toContain(`Estimated loan amount$320,000what $2,128.97 a month of principal and interest pays off over 30 years at 7%. Tax and insurance are not included.${NOT_A_LENDING_AMOUNT}Where each payment goes`);
    expect(phoneBar()).toContain("Estimated loan amount$320,000");
    for (const label of ["Home price", "Down payment", "Loan amount"]) expect(hasBox(label), label).toBe(false);
    expect(detailLabels()).toEqual(["Property tax", "Homeowners insurance", "HOA dues", "Mortgage insurance", "Home value", "Extra principal", "Pay the extra", "First payment"]);
    for (const label of ["Property tax", "Homeowners insurance", "HOA dues", "Mortgage insurance", "Home value", "Extra principal"]) expect(box(label).value, label).toBe("");
    expect(form().textContent).toContain("Optional. Sets when mortgage insurance ends.");
    expect(screen.getByLabelText("First payment month")).toBeTruthy();
    expect(`${results()}${printed()}`).not.toMatch(/Property tax|Homeowners|HOA|mortgage insurance|down payment|home value|home price|Full monthly payment/i);
    expect(printed()).toContain("Monthly payment (principal and interest)$2,128.97Interest rate7%Loan term30 yearsFirst paymentDec 2026");
    expect(printed()).toMatch(/^Loan amount estimate/);
    expect(printed()).toContain("Estimated loan amount$320,000Total interest");
    expect(document.body.textContent!.split(NOT_A_LENDING_AMOUNT).length - 1).toBe(2); // on screen and in print
    expect(yearRows()).toBe(30);
    expect(slider().max).toBe("360");
    // The schedule is the loan's own: the regular payment is the payment typed.
    press("Show every payment");
    expect(within(screen.getByRole("table")).getByText("Payment 1").closest("tr")!.textContent).toContain("$2,128.97");
    clean();
  });

  it("labels every box and groups every choice in each mode", () => {
    open();
    for (const name of ["Purchase", "Refinance", "Payment"] as const) {
      mode(name);
      for (const input of form().querySelectorAll<HTMLInputElement>('input[type="text"]')) {
        expect(form().querySelectorAll(`label[for="${input.id}"]`), `${name} ${input.id}`).toHaveLength(1);
        expect(document.querySelectorAll(`#${input.id}`), `${name} ${input.id}`).toHaveLength(1);
      }
      for (const radio of form().querySelectorAll('input[type="radio"]')) expect(radio.closest("fieldset")!.querySelector("legend"), name).not.toBeNull();
      for (const range of form().querySelectorAll('input[type="range"]')) expect(range.getAttribute("aria-label"), name).toBeTruthy();
      expect(screen.getByRole("group", { name: "Calculation type" })).toBeTruthy();
    }
  });
});

describe("costs added on top in Payment mode", () => {
  it("adds them to a full monthly payment and leaves the loan amount alone", () => {
    open();
    mode("Payment");
    type("Property tax", "4800");
    expect(results()).toContain("Estimated loan amount$320,000what $2,128.97 a month of principal and interest pays off over 30 years at 7%.");
    expect(results()).not.toContain("Tax and insurance are not included.");
    expect(results()).toContain(`${NOT_A_LENDING_AMOUNT}Full monthly payment`);
    expect(results()).toContain("$2,529principal, interest, tax");
    type("Homeowners insurance", "1800");
    type("HOA dues", "100");
    type("Mortgage insurance", "150");
    expect(results()).toContain("$2,929principal, interest, tax, insurance, HOA dues, mortgage insurance");
    expect(results()).toContain("Includes mortgage insurance until payment 162.");
    expect(results()).toContain("Estimated loan amount$320,000");
    expect(phoneBar()).toContain("Estimated loan amount$320,000");
    expect(printed()).toContain("Full monthly payment$2,929");
    expect(printed()).toContain("Mortgage insurance$150 a month, until payment 162");
    expect(printed()).not.toContain("Home value");
    press("Show every payment");
    const first = within(screen.getByRole("table")).getByText("Payment 1").closest("tr")!.textContent!;
    expect(first).toContain("$150.00"); // the mortgage insurance column
    expect(first).toContain("$2,928.97");
    type("Home value", "400000");
    expect(results()).toContain("Includes mortgage insurance until payment 29.");
    expect(results()).toContain("Estimated loan amount$320,000");
    expect(printed()).toContain("Home value$400,000");
    type("Home value", "500000");
    expect(results()).not.toContain("Includes mortgage insurance");
    expect(results()).toContain("$2,779principal, interest, tax, insurance, HOA dues");
    clean();
  });

  it("keeps them, and the home value, on the way to Refinance and back", () => {
    open();
    mode("Payment");
    type("Property tax", "5000");
    type("HOA dues", "75");
    type("Home value", "450000");
    mode("Refinance");
    expect(box("Property tax").value).toBe("5,000");
    expect(box("HOA dues").value).toBe("75");
    expect(box("Home value").value).toBe("450,000");
    type("Home value", "460000");
    mode("Payment");
    expect(box("Home value").value).toBe("460,000");
    expect(box("Property tax").value).toBe("5,000");
    mode("Purchase");
    expect(box("Property tax").value).toBe("5,000");
    expect(box("HOA dues").value).toBe("75");
  });
});

describe("a loan term of any whole year", () => {
  it.each([["Purchase", 7], ["Purchase", 29], ["Refinance", 13], ["Payment", 7], ["Payment", 1]] as const)("%s over %i years: the schedule, and the slider's last payment is its last row", (name, years) => {
    open();
    mode(name);
    type("Loan term", String(years));
    expect(status()).toBeNull();
    expect(yearRows()).toBe(years);
    expect(slider().max).toBe(String(years * 12));
    fireEvent.change(slider(), { target: { value: String(years * 12) } });
    expect(results()).toContain(`Payment ${years * 12} of ${years * 12}`);
    expect(results()).toContain("Remaining balance$0");
    press("Show every payment");
    const rows = screen.getByRole("table").querySelectorAll("tr");
    expect(rows).toHaveLength(1 + years + years * 12);
    expect(rows[rows.length - 1].textContent).toMatch(new RegExp(`^Payment ${years * 12}\\D.*\\$0\\.00$`));
    expect(results()).toContain(`after ${years} year${years === 1 ? "" : "s"}`);
    clean();
  });

  it("the term slider and the box move together", () => {
    open();
    fireEvent.change(screen.getByRole("slider", { name: "Loan term" }), { target: { value: "15" } });
    expect(box("Loan term").value).toBe("15");
    expect(yearRows()).toBe(15);
  });

  it("a term outside 1 to 30 is named and gives no result", () => {
    open();
    for (const mode_ of ["Purchase", "Refinance", "Payment"] as const) {
      mode(mode_);
      for (const bad of ["0", "31", "7.5"]) {
        type("Loan term", bad);
        expect(status(), `${mode_} ${bad}`).toBe("Enter a loan term from 1 to 30 years.");
        expect(document.querySelector("table")).toBeNull();
      }
      type("Loan term", "30");
      expect(status()).toBeNull();
    }
  });
});

describe("switching modes keeps what carries over", () => {
  it("Purchase to Refinance fills the loan with price minus down payment and the value with the price", () => {
    open();
    type("Home price", "500000");
    type("Interest rate", "6.5");
    type("Loan term", "20");
    type("Property tax", "6000");
    type("Extra principal", "100");
    mode("Refinance");
    expect(box("Loan amount").value).toBe("400,000");
    expect(box("Home value").value).toBe("500,000");
    expect(box("Interest rate").value).toBe("6.5");
    expect(box("Loan term").value).toBe("20");
    expect(box("Property tax").value).toBe("6,000");
    expect(box("Homeowners insurance").value).toBe("1,800");
    expect(box("Extra principal").value).toBe("100");
    expect(results()).toContain("principal and interest on a $400,000 loan.");
  });

  it("entering Payment fills the payment with the current loan's principal and interest, and the way back keeps every number", () => {
    open();
    type("Home price", "500000");
    const purchase = results();
    mode("Payment");
    expect(box("Monthly payment").value).toBe("2,661.21"); // $400,000 at 7% for 30 years
    expect(box("Interest rate").value).toBe("7");
    expect(box("Loan term").value).toBe("30");
    expect(results()).toContain("Estimated loan amount$400,000what $2,661.21 a month of principal and interest pays off over 30 years at 7%.");
    // The tax and insurance of the purchase come along, on top of the payment.
    expect(results()).toContain("Full monthly payment");
    expect(results()).toContain("$3,211principal, interest, tax, insurance");
    expect(results()).not.toContain("Estimated monthly payment");
    mode("Purchase");
    expect(box("Home price").value).toBe("500,000");
    expect(box("Down payment").value).toBe("20");
    expect(box("Property tax").value).toBe("4,800");
    expect(results()).toBe(purchase);
    expect(results()).not.toContain("Estimated loan amount");
  });

  it("Payment to Refinance fills an empty loan amount with the loan the payment pays off", () => {
    open();
    mode("Payment");
    type("Monthly payment", "1500");
    mode("Refinance");
    expect(box("Loan amount").value).toBe("225,461.35");
    expect(box("Home value").value).toBe("");
    expect(results()).toContain("principal and interest on a $225,461 loan.");
    expect(results()).not.toMatch(/mortgage insurance|home value|down/i);
    expect(printed()).not.toMatch(/Home value|Home price|Down payment/);
  });

  it("Clear and Load example stay in the mode", () => {
    open();
    for (const [name, required, prompt, example] of [
      ["Refinance", "Loan amount", "Enter the loan amount.", "320,000"],
      ["Payment", "Monthly payment", "Enter the monthly payment.", "2,128.97"],
      ["Purchase", "Home price", "Enter the home price.", "400,000"],
    ] as const) {
      mode(name);
      press("Clear");
      expect(chosen(name), name).toBe(true);
      expect(box(required).value).toBe("");
      expect(box("Interest rate").value).toBe("");
      expect(box("Loan term").value).toBe("30"); // Clear keeps the term
      expect(status()).toBe(prompt);
      expect(document.querySelector("table")).toBeNull();
      type(required, example);
      expect(status()).toBe("Enter the interest rate.");
      press("Load example");
      expect(chosen(name), name).toBe(true);
      expect(box(required).value).toBe(example);
      expect(box("Interest rate").value).toBe("7");
      expect(status()).toBeNull();
      clean();
    }
  });
});

describe("refinance and the home value", () => {
  it("without a home value: a result, no mortgage insurance, and the box says it is not counted", () => {
    open();
    mode("Refinance");
    type("Home value", "");
    expect(status()).toBeNull();
    expect(results()).toContain("Estimated monthly payment$2,679");
    type("Mortgage insurance", "150");
    expect(form().textContent).toContain("Per month. Not counted without a home value.");
    expect(results()).toContain("Estimated monthly payment$2,679");
    expect(results()).not.toMatch(/mortgage insurance|home value|down/i);
    expect(printed()).not.toMatch(/Home value|Mortgage insurance|Down payment/);
    clean();
  });

  it("with a loan above 80% of the value: the prompt speaks of the home value, then the insurance counts", () => {
    open();
    mode("Refinance");
    type("Loan amount", "360000");
    expect(results()).toContain("With a loan above 80% of the home value, most conventional loans add mortgage insurance. Add it under Add detail.");
    expect(results()).not.toContain("less than 20% down");
    type("Mortgage insurance", "150");
    expect(results()).toMatch(/Includes mortgage insurance until payment \d+\./);
    expect(printed()).toMatch(/Mortgage insurance\$150 a month, until payment \d+/);
  });

  it("with a home value below the loan: the box is named and there is no result", () => {
    open();
    mode("Refinance");
    type("Home value", "300000");
    expect(status()).toBe("The home value is below the loan amount.");
    expect(document.querySelector("table")).toBeNull();
    expect(screen.queryByRole("link", { name: /See results/ })).toBeNull();
  });
});
