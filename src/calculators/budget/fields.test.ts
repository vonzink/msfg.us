import { describe, expect, it } from "vitest";
import {
  BALANCE_FIELDS, balancesTotal, BLANK, entryFaults, exampleValues, FRONT_FIELDS, groupTotal, HOUSING_LINES, isItemized, LIVING_LINES, MODE_FIELDS,
  SAVINGS_RATE_FIELD, savingsRateUnreadable, toInput, type Group,
} from "./fields";
import golden from "./golden.json";
import { calculateBudget } from "./math";
import { addRow, blankRows, updateRow, type Row } from "./rows";

const example = exampleValues();
const noRows = blankRows();
const goldenCase = (name: string) => golden.cases.find((c) => c.name === name)!;
const result = (changes: Record<string, string> = {}, rows: Row[] = noRows) => calculateBudget(toInput({ ...example, ...changes }, rows));
const rowsOf = (payments: (string | number)[]): Row[] => payments.map((p, i) => ({ id: i + 1, name: "", payment: String(p) }));
const ALL = [...FRONT_FIELDS, ...MODE_FIELDS, ...HOUSING_LINES, ...LIVING_LINES, SAVINGS_RATE_FIELD, ...BALANCE_FIELDS];
const field = (id: string) => ALL.find((f) => f.id === id)!;

describe("home budget fields", () => {
  it("has five inputs up front", () => {
    expect(FRONT_FIELDS.map((f) => [f.id, f.type, f.label, f.hint])).toEqual([
      ["grossIncome", "money", "Gross monthly household income", "Before tax."],
      ["taxRate", "pct", "Estimated tax rate", "Federal, state and payroll taxes together, as a share of gross income."],
      ["housing", "money", "Monthly housing payment", undefined],
      ["debts", "money", "Monthly debt payments", "Car loans, student loans, credit card minimums and the like."],
      ["living", "money", "Monthly living costs", "Utilities, groceries, transport, insurance, childcare and the rest."],
    ]);
  });

  it("has the five housing lines of the spec, without flood or other housing", () => {
    expect(HOUSING_LINES.map((f) => [f.id, f.label])).toEqual([
      ["housingPi", "Principal and interest"],
      ["housingTax", "Property tax"],
      ["housingInsurance", "Homeowners insurance"],
      ["housingMi", "Mortgage insurance"],
      ["housingHoa", "HOA dues"],
    ]);
  });

  it("has the dashboard's eight living categories, in plain words", () => {
    expect(LIVING_LINES.map((f) => [f.id, f.label])).toEqual([
      ["livingUtilities", "Utilities"],
      ["livingPhone", "Phone, internet and cable"],
      ["livingGroceries", "Groceries"],
      ["livingTransport", "Transport and fuel"],
      ["livingInsurance", "Insurance"],
      ["livingChildcare", "Childcare and education"],
      ["livingEntertainment", "Subscriptions and entertainment"],
      ["livingOther", "Other living costs"],
    ]);
    expect(field("livingUtilities").hint).toBe("Electric, gas and water.");
    expect(field("livingInsurance").hint).toBe("Auto, health and life. Not homeowners insurance.");
  });

  it("has the dashboard's five balances", () => {
    expect(BALANCE_FIELDS.map((f) => [f.id, f.label])).toEqual([
      ["balanceChecking", "Checking accounts"],
      ["balanceSavings", "Savings accounts"],
      ["balanceRetirement", "Retirement accounts"],
      ["balanceInvestments", "Stocks and investments"],
      ["balanceOther", "Other assets"],
    ]);
    expect(field("balanceRetirement").hint).toBe("401(k), IRA and the like.");
  });

  it("has a savings rate and a One total / Itemize switch for each group", () => {
    expect(SAVINGS_RATE_FIELD).toMatchObject({ id: "savingsRate", type: "pct", example: "", label: "Share of income set aside as savings" });
    expect(MODE_FIELDS.map((f) => [f.id, f.type, f.example, f.label])).toEqual([
      ["housingMode", "choice", "total", "Enter housing as"],
      ["debtsMode", "choice", "total", "Enter debts as"],
      ["livingMode", "choice", "total", "Enter living costs as"],
    ]);
    for (const f of MODE_FIELDS) expect(f.options).toEqual([{ value: "total", label: "One total" }, { value: "itemized", label: "Itemize" }]);
  });

  it("every line and balance is a money box", () => {
    for (const f of [...HOUSING_LINES, ...LIVING_LINES, ...BALANCE_FIELDS]) expect(f, f.id).toMatchObject({ type: "money", example: "" });
  });

  it("keeps a typed 0 in every money box where 0 is an answer: all but the income and the balances", () => {
    expect(ALL.filter((f) => f.keepZero).map((f) => f.id)).toEqual([
      "housing", "debts", "living", ...HOUSING_LINES.map((f) => f.id), ...LIVING_LINES.map((f) => f.id),
    ]);
  });

  it("uses no word that reads as a loan decision", () => {
    const text = ALL.flatMap((f) => [f.label, f.hint ?? "", ...(f.options ?? []).map((o) => o.label)]).join(" ");
    expect(text).not.toMatch(/qualif|approv|eligib|your rate|should|DTI|guideline/i);
  });

  it("opens with the pinned example values", () => {
    expect(example).toEqual({
      grossIncome: "9,000", taxRate: "22", housing: "2,700", debts: "600", living: "2,500",
      housingMode: "total", debtsMode: "total", livingMode: "total",
      housingPi: "", housingTax: "", housingInsurance: "", housingMi: "", housingHoa: "",
      livingUtilities: "", livingPhone: "", livingGroceries: "", livingTransport: "",
      livingInsurance: "", livingChildcare: "", livingEntertainment: "", livingOther: "",
      savingsRate: "",
      balanceChecking: "", balanceSavings: "", balanceRetirement: "", balanceInvestments: "", balanceOther: "",
    });
  });

  it("clears to empty boxes with every group back to one total", () => {
    expect(Object.keys(BLANK)).toEqual(Object.keys(example));
    for (const [id, value] of Object.entries(BLANK)) expect(value, id).toBe(id.endsWith("Mode") ? "total" : "");
  });
});

describe("B5: negative and unreadable entries behind Add detail", () => {
  const faults = (changes: Record<string, string> = {}, rows: Row[] = noRows) => entryFaults({ ...example, ...changes }, rows);

  it("finds nothing wrong in the example or a cleared form", () => {
    expect(faults()).toEqual({ negative: null, unreadable: null });
    expect(entryFaults(BLANK, noRows)).toEqual({ negative: null, unreadable: null });
  });

  it("names a negative line of an itemized group, a negative debt row and a negative balance", () => {
    expect(faults({ housingMode: "itemized", housingPi: "1,900", housingTax: "-50" }).negative).toBe("Property tax");
    expect(faults({ livingMode: "itemized", livingGroceries: "-1" }).negative).toBe("Groceries");
    expect(faults({ debtsMode: "itemized" }, rowsOf([350, -20])).negative).toBe("Debt 2 monthly payment");
    expect(faults({ debtsMode: "itemized" }, [{ id: 1, name: "Car loan", payment: "-20" }]).negative).toBe("Car loan monthly payment");
    expect(faults({ balanceSavings: "-100" }).negative).toBe("Savings accounts");
  });

  it("ignores the lines and rows of a group entered as one total", () => {
    expect(faults({ housingTax: "-50", livingGroceries: "abc" }, rowsOf([-20]))).toEqual({ negative: null, unreadable: null });
  });

  it("names the group with a line that is not a number, apart from a group with nothing entered", () => {
    expect(faults({ housingMode: "itemized", housingPi: "1,900", housingTax: "12..5" }).unreadable).toBe("housing");
    expect(faults({ debtsMode: "itemized" }, rowsOf(["abc"])).unreadable).toBe("debts");
    expect(faults({ livingMode: "itemized", livingOther: "." }).unreadable).toBe("living");
    expect(faults({ housingMode: "itemized" }).unreadable).toBeNull();
  });
});

describe("the example", () => {
  it("gives the golden example's input and result", () => {
    const { input, expected } = goldenCase("example");
    // The savings rate is empty, which is "not entered"; the model counts it as 0.
    expect(toInput(example, noRows)).toEqual({ ...input, savingsRate: Number.NaN, balances: Number.NaN });
    expect(result()).toEqual(calculateBudget(input));
    expect(result()).toMatchObject({ residual: expected.residual, spendable: expected.spendable, totalExpenses: expected.totalExpenses, cashFlow: expected.cashFlow, reserveMonths: null });
    expect(result()).toMatchObject({ residual: 5700, cashFlow: 1220 });
  });

  it("with a savings rate and a balance is the golden case with both", () => {
    const { input, expected } = goldenCase("with-savings-and-balances");
    const typed = { ...example, savingsRate: "10", balanceSavings: "25,000" };
    expect(toInput(typed, noRows)).toEqual(input);
    expect(calculateBudget(toInput(typed, noRows))).toMatchObject({ spendable: expected.spendable, cashFlow: expected.cashFlow, reserveMonths: expected.reserveMonths });
  });
});

describe("itemizing a group", () => {
  const { input, expected, lines } = goldenCase("itemized");
  const text = (amounts: Record<string, number>) => Object.fromEntries(Object.entries(amounts).map(([id, n]) => [id, String(n)]));
  const typed = {
    ...BLANK, grossIncome: "9,000", taxRate: "22",
    housingMode: "itemized", debtsMode: "itemized", livingMode: "itemized",
    ...text(lines!.housing), ...text(lines!.living),
  };
  const rows = rowsOf(lines!.debts);

  it("reaches the itemized golden case through the lines and the rows", () => {
    expect(Object.keys(lines!.housing)).toEqual(HOUSING_LINES.map((f) => f.id));
    expect(Object.keys(lines!.living)).toEqual(LIVING_LINES.map((f) => f.id));
    expect(toInput(typed, rows)).toEqual({ ...input, savingsRate: Number.NaN, balances: Number.NaN });
    const r = calculateBudget(toInput(typed, rows))!;
    expect(Number((r.frontRatio * 100).toFixed(2))).toBe(expected.frontRatioPct);
    expect(Number((r.backRatio * 100).toFixed(2))).toBe(expected.backRatioPct);
    expect(r).toMatchObject({ residual: expected.residual, spendable: expected.spendable, totalExpenses: expected.totalExpenses, cashFlow: expected.cashFlow });
  });

  it("gives each group's total, which is what the front box shows", () => {
    expect(groupTotal(typed, rows, "housing")).toBe(2700);
    expect(groupTotal(typed, rows, "debts")).toBe(600);
    expect(groupTotal(typed, rows, "living")).toBe(2500);
    for (const group of ["housing", "debts", "living"] as const) {
      expect(isItemized(typed, group)).toBe(true);
      expect(isItemized(example, group)).toBe(false);
      expect(groupTotal(example, noRows, group)).toBe(toInput(example, noRows)[group]);
    }
  });

  it("uses the sum of the lines and ignores the stale total; switching back uses the total and keeps the lines", () => {
    const stale = { ...example, housingPi: "2,000", housingTax: "500.50", debts: "600", living: "2,500" };
    const debtRows = rowsOf(["400", "25"]);
    const livingLines = { livingGroceries: "900", livingOther: "100" };
    const cases: [Group, Record<string, string>, number, number][] = [
      ["housing", {}, 2500.5, 2700],
      ["debts", {}, 425, 600],
      ["living", livingLines, 1000, 2500],
    ];
    for (const [group, extra, itemized, total] of cases) {
      const on = { ...stale, ...extra, [`${group}Mode`]: "itemized" };
      expect(toInput(on, debtRows)[group], group).toBe(itemized);
      expect(groupTotal(on, debtRows, group), group).toBe(itemized);
      // The other two groups are untouched.
      for (const other of (["housing", "debts", "living"] as const).filter((g) => g !== group)) {
        expect(toInput(on, debtRows)[other], `${group} ${other}`).toBe(toInput(stale, debtRows)[other]);
      }
      const back = { ...on, [`${group}Mode`]: "total" };
      expect(toInput(back, debtRows)[group], group).toBe(total);
      expect(back.housingPi).toBe("2,000");
    }
    // In total mode the lines and the rows count for nothing.
    expect(toInput(stale, debtRows)).toMatchObject({ housing: 2700, debts: 600, living: 2500 });
  });

  it("never double counts: the result uses the lines alone", () => {
    const on = { ...example, housingMode: "itemized", housingPi: "1,000" };
    expect(calculateBudget(toInput(on, noRows))).toMatchObject({ totalExpenses: 4100, residual: 7400 }); // 1,000 + 600 + 2,500
  });

  it("with every line empty is not entered, and gives no result", () => {
    for (const group of ["housing", "debts", "living"] as const) {
      const on = { ...example, [`${group}Mode`]: "itemized" };
      expect(Number.isNaN(toInput(on, noRows)[group]), group).toBe(true);
      expect(Number.isNaN(groupTotal(on, noRows, group)), group).toBe(true);
      expect(calculateBudget(toInput(on, noRows)), group).toBeNull();
    }
  });

  it("counts an empty line beside a filled one as nothing, and a typed 0 as entered", () => {
    expect(toInput({ ...example, housingMode: "itemized", housingPi: "1,900" }, noRows).housing).toBe(1900);
    expect(toInput({ ...example, housingMode: "itemized", housingHoa: "0" }, noRows).housing).toBe(0);
    expect(toInput({ ...example, livingMode: "itemized", livingOther: "0.00" }, noRows).living).toBe(0);
    expect(toInput({ ...example, debtsMode: "itemized" }, rowsOf(["0", ""])).debts).toBe(0);
    expect(calculateBudget(toInput({ ...example, debtsMode: "itemized" }, rowsOf(["0", ""])))!.totalExpenses).toBe(5200);
  });

  it("is not entered when a line holds something unreadable, instead of leaving that line out", () => {
    for (const junk of ["abc", ".", "4..8", "15o"]) {
      expect(Number.isNaN(toInput({ ...example, housingMode: "itemized", housingPi: "1,900", housingTax: junk }, noRows).housing), junk).toBe(true);
      expect(Number.isNaN(toInput({ ...example, livingMode: "itemized", livingGroceries: "800", livingOther: junk }, noRows).living), junk).toBe(true);
      expect(Number.isNaN(toInput({ ...example, debtsMode: "itemized" }, rowsOf(["350", junk])).debts), junk).toBe(true);
    }
  });

  it("adds up to eight debt rows, to the cent", () => {
    let rows = blankRows();
    while (rows.length < 8) rows = addRow(rows);
    rows.forEach((r, i) => { rows = updateRow(rows, r.id, "payment", `1${i}0.10`); });
    expect(toInput({ ...example, debtsMode: "itemized" }, rows).debts).toBe(1080.8); // 100.10 + 110.10 + ... + 170.10
  });
});

describe("nothing to work out gives no result", () => {
  it("a cleared form", () => {
    expect(calculateBudget(toInput(BLANK, blankRows()))).toBeNull();
  });

  it.each(FRONT_FIELDS.map((f) => f.id))("the example with %s emptied", (id) => {
    expect(result({ [id]: "" })).toBeNull();
    expect(result({ [id]: " " })).toBeNull();
  });

  it.each(FRONT_FIELDS.map((f) => f.id))("the example with something unreadable in %s", (id) => {
    for (const junk of ["abc", ".", "2..5", "-"]) expect(result({ [id]: junk }), junk).toBeNull();
  });

  it("an income of 0", () => {
    expect(result({ grossIncome: "0" })).toBeNull();
  });

  it("after Clear, four of the five example numbers are not enough; the fifth gives the example again", () => {
    const five = { grossIncome: "9000", taxRate: "22", housing: "2700", debts: "600", living: "2500" };
    for (const id of Object.keys(five)) expect(calculateBudget(toInput({ ...BLANK, ...five, [id]: "" }, blankRows())), id).toBeNull();
    expect(calculateBudget(toInput({ ...BLANK, ...five }, blankRows()))).toEqual(result());
  });

  it("but a typed 0 in the tax rate, the debts and the living costs is an answer", () => {
    expect(result({ taxRate: "0" })).toMatchObject({ taxAmount: 0, spendable: 9000, cashFlow: 3200 });
    expect(result({ debts: "0" })).toMatchObject({ residual: 6300, totalExpenses: 5200 });
    expect(result({ living: "0" })).toMatchObject({ totalExpenses: 3300, cashFlow: 3720 });
    expect(result({ taxRate: "0", debts: "0", living: "0.00" })).toMatchObject({ totalExpenses: 2700, cashFlow: 6300 });
    expect(result({ housing: "0" })).toMatchObject({ frontRatio: 0, totalExpenses: 3100 });
  });
});

describe("percents", () => {
  it("are decimals in the input", () => {
    expect(toInput({ ...example, taxRate: "22.5%", savingsRate: "7,5" }, noRows)).toMatchObject({ taxRate: 0.225, savingsRate: 0.075 });
    expect(toInput({ ...example, taxRate: "0", savingsRate: "0" }, noRows)).toMatchObject({ taxRate: 0, savingsRate: 0 });
  });

  it("are NaN, never 0, when empty or unreadable", () => {
    for (const id of ["taxRate", "savingsRate"] as const) {
      for (const junk of ["", " ", ".", "abc", "2..2", "1-2"]) expect(Number.isNaN(toInput({ ...example, [id]: junk }, noRows)[id]), `${id} ${JSON.stringify(junk)}`).toBe(true);
    }
  });

  it("outside 0 to 100% give no result", () => {
    for (const id of ["taxRate", "savingsRate"]) for (const typed of ["-1", "101"]) expect(result({ [id]: typed }), `${id} ${typed}`).toBeNull();
    expect(result({ taxRate: "100" })).not.toBeNull();
  });

  it("an empty savings rate is none; something unreadable in it can be told apart", () => {
    expect(result({ savingsRate: "" })!.savingsAmount).toBe(0);
    for (const text of ["", " ", "0", "10", "7.5%"]) expect(savingsRateUnreadable({ ...example, savingsRate: text }), JSON.stringify(text)).toBe(false);
    for (const text of [".", "abc", "1..0"]) expect(savingsRateUnreadable({ ...example, savingsRate: text }), JSON.stringify(text)).toBe(true);
  });
});

describe("balances", () => {
  it("add up across the five boxes", () => {
    const typed = { ...example, balanceChecking: "5,000", balanceSavings: "10,000.50", balanceRetirement: "8000", balanceInvestments: "1,500", balanceOther: "499.50" };
    expect(balancesTotal(typed)).toBe(25000);
    expect(toInput(typed, noRows).balances).toBe(25000);
    expect(calculateBudget(toInput(typed, noRows))!.reserveMonths).toBe(9);
  });

  it("are not entered when every box is empty or one is unreadable, and then no months are shown", () => {
    expect(Number.isNaN(balancesTotal(example))).toBe(true);
    expect(Number.isNaN(balancesTotal({ ...example, balanceSavings: "25,000", balanceOther: "abc" }))).toBe(true);
    expect(result({ balanceSavings: "25,000", balanceOther: "abc" })!.reserveMonths).toBeNull();
    expect(result({ balanceSavings: "0" })!.reserveMonths).toBeNull();
  });
});
