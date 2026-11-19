import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_TENANT_CONFIG } from "@/content/site";

// A tenant can switch a calculator off in its config. Its page must then be "not found", and the
// landing page must go too when nothing is left.
const settings = vi.hoisted(() => ({ disabled: [] as string[] }));
vi.mock("@/server/tenant/config", () => ({
  getTenantConfig: async () => ({
    ...DEFAULT_TENANT_CONFIG,
    calculators: { ...DEFAULT_TENANT_CONFIG.calculators, disabled: settings.disabled },
  }),
}));

import AprPage from "./apr/page";
import BlendedRatePage from "./blended-rate/page";
import BudgetPage from "./budget/page";
import BuydownPage from "./buydown/page";
import MortgagePage from "./mortgage/page";
import BreakevenPage from "./refinance-breakeven/page";
import RentVsBuyPage from "./rent-vs-buy/page";
import InvestmentPage from "./investment/page";
import LandingPage from "./page";
import { InvestmentCalculator } from "@/calculators/investment/InvestmentCalculator";
import { HOW_IT_WORKS as INVESTMENT_HOW, INTRO as INVESTMENT_INTRO, QUESTIONS as INVESTMENT_QUESTIONS } from "@/calculators/investment/content";
import { CalculatorPage } from "@/calculators/shared/CalculatorPage";

type Node = string | number | null | undefined | boolean | Node[] | { type: unknown; props: Record<string, unknown> & { children?: Node } };
/** Every piece of text written straight into an element tree, in order, without running its components. */
const texts = (node: Node): string[] => {
  if (typeof node === "string") return [node];
  if (Array.isArray(node)) return node.flatMap(texts);
  if (node && typeof node === "object") return texts(node.props.children);
  return [];
};
/** Every element of one component type in an element tree. */
const elementsOf = (node: Node, type: unknown): { props: Record<string, unknown> }[] => {
  if (Array.isArray(node)) return node.flatMap((n) => elementsOf(n, type));
  if (!node || typeof node !== "object") return [];
  return [...(node.type === type ? [node] : []), ...elementsOf(node.props.children, type)];
};

const NOT_FOUND = /NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/;
const outcome = (page: () => Promise<unknown>) =>
  page().then(() => "renders", (e: { digest?: string; message?: string }) => (NOT_FOUND.test(`${e.digest} ${e.message}`) ? "not found" : `error: ${e.message}`));

describe("switched-off calculators", () => {
  beforeEach(() => { settings.disabled = []; });

  it("renders every page when nothing is switched off", async () => {
    expect(await outcome(MortgagePage)).toBe("renders");
    expect(await outcome(BuydownPage)).toBe("renders");
    expect(await outcome(InvestmentPage)).toBe("renders");
    expect(await outcome(RentVsBuyPage)).toBe("renders");
    expect(await outcome(BudgetPage)).toBe("renders");
    expect(await outcome(AprPage)).toBe("renders");
    expect(await outcome(BlendedRatePage)).toBe("renders");
    expect(await outcome(BreakevenPage)).toBe("renders");
    expect(await outcome(LandingPage)).toBe("renders");
  });

  it("makes a switched-off APR calculator not found", async () => {
    expect(await outcome(AprPage)).toBe("renders");
    settings.disabled = ["apr"];
    expect(await outcome(AprPage)).toBe("not found");
    expect(await outcome(MortgagePage)).toBe("renders");
    expect(await outcome(BudgetPage)).toBe("renders");
    expect(await outcome(LandingPage)).toBe("renders");
  });

  it("gives the APR page the example rate, its note and the disclaimer from tenant config", async () => {
    const page = (await AprPage()) as { props: { entry: { slug: string }; intro?: string; children: { props: Record<string, unknown> } } };
    expect(page.props.entry.slug).toBe("apr");
    expect(page.props.intro).toBeUndefined();
    expect(page.props.children.props).toEqual({
      exampleRatePct: DEFAULT_TENANT_CONFIG.calculators.exampleRatePct,
      exampleRateNote: DEFAULT_TENANT_CONFIG.legal.exampleRateNote,
      disclaimer: DEFAULT_TENANT_CONFIG.legal.calculatorDisclaimer,
    });
  });

  it("makes a switched-off home budget calculator not found", async () => {
    expect(await outcome(BudgetPage)).toBe("renders");
    settings.disabled = ["budget"];
    expect(await outcome(BudgetPage)).toBe("not found");
    expect(await outcome(MortgagePage)).toBe("renders");
    expect(await outcome(LandingPage)).toBe("renders");
  });

  it("gives the home budget page a link to the Mortgage calculator only while that one is on", async () => {
    const href = async () => ((await BudgetPage()) as { props: { children: { props: { mortgageHref: string | null } } } }).props.children.props.mortgageHref;
    expect(await href()).toBe("/calculators/mortgage");
    settings.disabled = ["mortgage"];
    expect(await href()).toBeNull();
    expect(await outcome(BudgetPage)).toBe("renders");
  });

  it("makes a switched-off rent vs buy calculator not found", async () => {
    expect(await outcome(RentVsBuyPage)).toBe("renders");
    settings.disabled = ["rent-vs-buy"];
    expect(await outcome(RentVsBuyPage)).toBe("not found");
    expect(await outcome(MortgagePage)).toBe("renders");
    expect(await outcome(LandingPage)).toBe("renders");
  });

  it("makes a switched-off investment calculator not found", async () => {
    expect(await outcome(InvestmentPage)).toBe("renders");
    settings.disabled = ["investment"];
    expect(await outcome(InvestmentPage)).toBe("not found");
    expect(await outcome(MortgagePage)).toBe("renders");
    expect(await outcome(LandingPage)).toBe("renders");
  });

  it("puts the investment page on the shared calculator page, with the settings from tenant config", async () => {
    const page = (await InvestmentPage()) as { type: unknown; props: Record<string, unknown> & { entry: { slug: string }; children: { type: unknown; props: Record<string, unknown> } } };
    expect(page.type).toBe(CalculatorPage);
    expect(page.props.entry.slug).toBe("investment");
    expect(page.props.intro).toBe(INVESTMENT_INTRO);
    expect(page.props.howItWorks).toBe(INVESTMENT_HOW);
    expect(page.props.questions).toBe(INVESTMENT_QUESTIONS);
    expect(page.props.children.type).toBe(InvestmentCalculator);
    expect(page.props.children.props).toEqual({
      exampleRatePct: DEFAULT_TENANT_CONFIG.calculators.exampleRatePct,
      exampleRateNote: DEFAULT_TENANT_CONFIG.legal.exampleRateNote,
      disclaimer: DEFAULT_TENANT_CONFIG.legal.calculatorDisclaimer,
    });
  });

  it("shows the investment page's heading, intro, calculator, How this works and questions", async () => {
    const page = (await InvestmentPage()) as { props: Parameters<typeof CalculatorPage>[0] };
    const tree = CalculatorPage(page.props) as Node;
    const shown = texts(tree);
    expect(shown.filter((t) => t === "Will this rental pay off?")).toHaveLength(1);
    expect(shown).toContain(INVESTMENT_INTRO);
    expect(shown).toContain("How this works");
    expect(shown).toContain("Common questions");
    for (const p of INVESTMENT_HOW) expect(shown, p).toContain(p);
    for (const { q, a } of INVESTMENT_QUESTIONS) {
      expect(shown, q).toContain(q);
      expect(shown, a).toContain(a);
    }
    expect(elementsOf(tree, InvestmentCalculator)).toHaveLength(1);
  });

  it("makes a switched-off refinance breakeven calculator not found", async () => {
    expect(await outcome(BreakevenPage)).toBe("renders");
    settings.disabled = ["refinance-breakeven"];
    expect(await outcome(BreakevenPage)).toBe("not found");
    expect(await outcome(BlendedRatePage)).toBe("renders");
  });

  it("gives the blended rate page a link to the breakeven calculator only while that one is on", async () => {
    const href = async () => ((await BlendedRatePage()) as { props: { children: { props: { breakevenHref: string | null } } } }).props.children.props.breakevenHref;
    expect(await href()).toBe("/calculators/refinance-breakeven");
    settings.disabled = ["refinance-breakeven"];
    expect(await href()).toBeNull();
  });

  it("B8: only the home budget and APR pages word their call to action differently", async () => {
    const title = async (page: () => Promise<unknown>) => ((await page()) as { props: { ctaTitle?: string } }).props.ctaTitle;
    expect(await title(BudgetPage)).toBe("Want to go through your numbers with someone?");
    expect(await title(AprPage)).toBe("Want to go through your numbers with someone?");
    for (const page of [MortgagePage, BuydownPage, BlendedRatePage, BreakevenPage, RentVsBuyPage, InvestmentPage]) expect(await title(page)).toBeUndefined();
  });

  it("makes a switched-off blended rate calculator not found", async () => {
    expect(await outcome(BlendedRatePage)).toBe("renders");
    settings.disabled = ["blended-rate"];
    expect(await outcome(BlendedRatePage)).toBe("not found");
    expect(await outcome(BuydownPage)).toBe("renders");
  });

  it("makes a switched-off buydown calculator not found", async () => {
    settings.disabled = ["buydown"];
    expect(await outcome(BuydownPage)).toBe("not found");
    expect(await outcome(MortgagePage)).toBe("renders");
  });

  it("makes only the switched-off calculator not found", async () => {
    settings.disabled = ["mortgage"];
    expect(await outcome(MortgagePage)).toBe("not found");
    expect(await outcome(InvestmentPage)).toBe("renders");
    expect(await outcome(LandingPage)).toBe("renders");
  });

  it("makes the landing page not found when every calculator is off", async () => {
    settings.disabled = ["mortgage", "buydown", "blended-rate", "refinance-breakeven", "rent-vs-buy", "budget", "investment"];
    // The APR calculator alone keeps the landing page.
    expect(await outcome(LandingPage)).toBe("renders");
    settings.disabled = [...settings.disabled, "apr"];
    expect(await outcome(LandingPage)).toBe("not found");
  });
});
