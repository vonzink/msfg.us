// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MortgageCalculator } from "./MortgageCalculator";
import baseline from "./purchase-baseline.json";

/**
 * Purchase mode must not change. `purchase-baseline.json` was recorded from the page as it was
 * before the Purchase / Refinance / Payment switch existed (commit 1e13553), with the capture
 * below, and this test requires the page to still produce it.
 *
 * What is compared: the whole calculator as the browser holds it on opening (the buttons, the
 * form, the results column, the print summary, the schedule, the printed disclaimer and the phone
 * bar), tag by tag with every class, minus the two things that were meant to change: the mode
 * switch and the loan term field. Then every row of the schedule with all 360 payments shown.
 * Today is pinned so the first payment is December 2026.
 */
vi.useFakeTimers({ toFake: ["Date"] });
vi.setSystemTime(new Date(2026, 10, 18));

afterEach(cleanup);

function capture(): { page: string[]; schedule: string[] } {
  const { container } = render(<MortgageCalculator exampleRatePct={7} exampleRateNote="Example rate for illustration, not an offer." disclaimer="This is an estimate based on the numbers you entered." />);
  const copy = container.cloneNode(true) as HTMLElement;
  copy.querySelector('input[name="mortgage-mode"]')?.closest("fieldset")?.remove();
  // The term was five buttons and is now a number box with a slider.
  const termButton = copy.querySelector('input[name="mortgage-termYears"]');
  if (termButton) termButton.closest("fieldset")!.remove();
  else copy.querySelector("#mortgage-termYears")!.parentElement!.parentElement!.remove();
  const page = copy.innerHTML.split(/(?<=>)(?=<)/);

  fireEvent.click(screen.getByRole("button", { name: "Show every payment" }));
  const schedule = Array.from(container.querySelectorAll('section[aria-label="Amortization schedule"] tr'), (row) =>
    Array.from(row.children, (cell) => cell.textContent).join(" | "),
  );
  return { page, schedule };
}

describe("purchase mode is unchanged", () => {
  it("gives the page recorded before the modes were added, apart from the switch and the term field", () => {
    const now = capture();
    expect(now.schedule).toHaveLength(1 + 30 + 360);
    expect(now.schedule).toEqual(baseline.schedule);
    expect(now.page).toEqual(baseline.page);
  });
});
