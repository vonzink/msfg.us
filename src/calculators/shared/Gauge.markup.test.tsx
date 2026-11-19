import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GaugeDial } from "./Gauge";
import type { Scale } from "./gaugeScale";

const s: Scale = { min: 0, fair: 10, good: 20, max: 40 };
const dial = (value: number, props: { mirror?: boolean; edgeLabels?: [string, string] } = {}) =>
  renderToStaticMarkup(<GaugeDial value={value} scale={s} {...props} />);
const zones = (html: string) => [...html.matchAll(/<path d="M([\d.]+),[^"]*"[^>]*class="([^"]*)"/g)].map((m) => ({ x: Number(m[1]), cls: m[2] }));
const angle = (html: string) => Number(html.match(/rotate\((-?[\d.]+)deg\)/)![1]);

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
