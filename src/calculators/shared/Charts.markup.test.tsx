import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SeriesChart } from "./Charts";

const yearLabels = (points: number) => {
  const data = Array.from({ length: points }, (_, i) => 1000 * (points - i));
  const html = renderToStaticMarkup(<SeriesChart kind="lines" title="Balance" series={[{ label: "Loan balance", data }]} />);
  return [...html.matchAll(/>Yr (?:<!-- -->)?(\d+)</g)].map((m) => Number(m[1]));
};

describe("SeriesChart year labels", () => {
  it("labels every year on a short chart", () => {
    expect(yearLabels(5)).toEqual([1, 2, 3, 4, 5]);
  });

  it("thins the labels on a long chart but keeps the first and last year", () => {
    const labels = yearLabels(30);
    expect(labels.length).toBeLessThanOrEqual(8);
    expect(labels[0]).toBe(1);
    expect(labels.at(-1)).toBe(30);
  });
});
