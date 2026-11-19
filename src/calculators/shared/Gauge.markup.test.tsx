import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GaugeDial, GaugeRating } from "./Gauge";
import type { Scale } from "./gaugeScale";

const s: Scale = { min: 0, fair: 10, good: 20, max: 40 };
const dial = (value: number, props: { mirror?: boolean; edgeLabels?: [string, string]; twoZone?: boolean; centerLabel?: string } = {}) =>
  renderToStaticMarkup(<GaugeDial value={value} scale={s} {...props} />);
const zones = (html: string) => [...html.matchAll(/<path d="M([\d.]+),[^"]*"[^>]*class="([^"]*)"/g)].map((m) => ({ x: Number(m[1]), cls: m[2] }));
const angle = (html: string) => Number(html.match(/rotate\((-?[\d.]+)deg\)/)![1]);

describe("the word under a dial", () => {
  const word = (value: number) => renderToStaticMarkup(<GaugeRating value={value} scale={s} />).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

  it("names the zone as Lower, Middle or Higher, and never as a grade", () => {
    expect(word(5)).toBe("Rating: Lower");
    expect(word(15)).toBe("Rating: Middle");
    expect(word(25)).toBe("Rating: Higher");
    expect(word(Number.NaN)).toBe("");
  });
});

describe("the dial as every calculator has had it", () => {
  it("draws poor, fair, good from left to right, with no text on it", () => {
    const html = dial(15);
    expect(zones(html).map((z) => z.cls.match(/stroke-(loss|chart-4|chart-3)/)![1])).toEqual(["loss", "chart-4", "chart-3"]);
    expect(zones(html)[0].x).toBe(12);
    expect(html).not.toContain("<text");
  });

  it("moves the needle to the right as the value rises", () => {
    expect(angle(dial(0))).toBe(-90);
    expect(angle(dial(15))).toBe(0);
    expect(angle(dial(40))).toBe(90);
  });

  it("is the same markup when the new options are left out or switched off", () => {
    expect(dial(15, { mirror: false })).toBe(dial(15));
    expect(dial(Number.NaN, { mirror: false })).toBe(dial(Number.NaN));
    expect(dial(15, { twoZone: false })).toBe(dial(15));
    expect(dial(15)).toContain('viewBox="0 0 120 68"');
    expect(zones(dial(15))).toHaveLength(3);
  });
});

describe("the mirrored dial, for a figure that is better when lower", () => {
  it("draws good, fair, poor from left to right and keeps the current zone lit", () => {
    const html = dial(25, { mirror: true });
    expect(zones(html).map((z) => z.cls.match(/stroke-(loss|chart-4|chart-3)/)![1])).toEqual(["chart-3", "chart-4", "loss"]);
    expect(zones(html)[0].x).toBe(12);
    expect(zones(html).map((z) => z.cls.includes("opacity-30"))).toEqual([false, true, true]);
  });

  it("turns the needle the other way: the best value is at the far left", () => {
    expect(angle(dial(40, { mirror: true }))).toBe(-90);
    expect(angle(dial(15, { mirror: true }))).toBe(0);
    expect(angle(dial(0, { mirror: true }))).toBe(90);
  });

  it("writes a label at each of the two cutoffs, left then right", () => {
    const html = dial(25, { mirror: true, edgeLabels: ["32%", "47%"] });
    const labels = [...html.matchAll(/<text x="([\d.]+)"[^>]*>([^<]+)<\/text>/g)].map((m) => ({ x: Number(m[1]), text: m[2] }));
    expect(labels.map((l) => l.text)).toEqual(["32%", "47%"]);
    expect(labels[0].x).toBeLessThan(60);
    expect(labels[1].x).toBeGreaterThan(60);
    expect(html).toContain("fill-muted");
  });
});

describe("the two-zone dial, for a figure that is only above or below a line", () => {
  const two: Scale = { min: -0.5, fair: 0, good: 0, max: 0.5 };
  const half = (value: number, centerLabel?: string) => renderToStaticMarkup(<GaugeDial value={value} scale={two} twoZone centerLabel={centerLabel} />);
  const lit = (html: string) => zones(html).map((z) => !z.cls.includes("opacity-30"));

  it("draws the loss colour left of centre and the good colour right of it, and no middle zone", () => {
    const html = half(0.2);
    expect(zones(html).map((z) => z.cls.match(/stroke-(loss|chart-4|chart-3)/)![1])).toEqual(["loss", "chart-3"]);
    expect(zones(html)[0].x).toBe(12);
    // The second zone starts just right of the top centre.
    expect(zones(html)[1].x).toBeGreaterThan(60);
    expect(zones(html)[1].x).toBeLessThan(62);
  });

  it("places the needle by the value, with the line at the top centre, pinned at either end", () => {
    expect(angle(half(0))).toBe(0);
    expect(angle(half(0.25))).toBe(45);
    expect(angle(half(-0.25))).toBe(-45);
    expect(angle(half(2))).toBe(90);
    expect(angle(half(-2))).toBe(-90);
  });

  it("lights the side the value is on, and neither side for a value exactly on the line", () => {
    expect(lit(half(0.2))).toEqual([false, true]);
    expect(lit(half(-0.2))).toEqual([true, false]);
    expect(lit(half(0))).toEqual([false, false]);
  });

  it("writes a label over the top centre, with room for it", () => {
    const html = half(0.2, "$0");
    expect(html).toMatch(/<text x="60"[^>]*text-anchor="middle"[^>]*>\$0<\/text>/);
    expect(html).not.toContain('viewBox="0 0 120 68"');
    expect(half(0.2)).toContain('viewBox="0 0 120 68"');
    expect(half(0.2)).not.toContain("<text");
  });

  it("is grey with no needle when there is no value", () => {
    const html = half(Number.NaN, "$0");
    expect(html).not.toContain("rotate(");
    expect(html).not.toContain("stroke-loss");
  });
});
