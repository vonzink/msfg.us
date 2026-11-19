import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { CALCULATORS } from "../registry";
import { CalculatorCta, CalculatorPage } from "./CalculatorPage";

const entry = CALCULATORS[0];
type Props = Record<string, unknown> & { children?: unknown };
/** The title handed to the call to action band at the foot of the page. */
const bandTitle = (cta: ReactElement) => ((cta.props as Props).children as ReactElement<Props>).props.title;
const pageCta = (ctaTitle?: string) => {
  const page = CalculatorPage({ entry, howItWorks: ["How."], questions: [], children: null, ctaTitle }) as ReactElement<Props>;
  const parts = page.props.children as ReactElement<Props>[];
  const cta = parts[parts.length - 1];
  expect(cta.type).toBe(CalculatorCta);
  return CalculatorCta(cta.props as Parameters<typeof CalculatorCta>[0]);
};

describe("the call to action under a calculator", () => {
  it("asks a neutral question on every calculator unless the page says otherwise, and never 'Like these numbers?'", () => {
    expect(bandTitle(CalculatorCta({ entry }))).toBe("Want to go through your numbers with someone?");
    expect(bandTitle(pageCta())).toBe("Want to go through your numbers with someone?");
  });

  it("takes a title from the page", () => {
    expect(bandTitle(CalculatorCta({ entry, title: "Something else?" }))).toBe("Something else?");
    expect(bandTitle(pageCta("Want to go through your numbers with someone?"))).toBe("Want to go through your numbers with someone?");
  });
});
