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

import BlendedRatePage from "./blended-rate/page";
import BudgetPage from "./budget/page";
import BuydownPage from "./buydown/page";
import MortgagePage from "./mortgage/page";
import BreakevenPage from "./refinance-breakeven/page";
import RentVsBuyPage from "./rent-vs-buy/page";
import InvestmentPage from "./investment/page";
import LandingPage from "./page";

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
    expect(await outcome(LandingPage)).toBe("renders");
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

  it("B8: only the home budget page words its call to action differently", async () => {
    const title = async (page: () => Promise<unknown>) => ((await page()) as { props: { ctaTitle?: string } }).props.ctaTitle;
    expect(await title(BudgetPage)).toBe("Want to go through your numbers with someone?");
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
    expect(await outcome(LandingPage)).toBe("not found");
  });
});
