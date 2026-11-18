import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { RestingCard } from "./RestingCard";

describe("RestingCard", () => {
  it("shows the intent choices without exposing AI mode when the feature is disabled", () => {
    const html = renderToStaticMarkup(
      createElement(RestingCard, {
        assistantName: "MSFG AI",
        shortName: "MSFG",
        iconSrc: "/brand/msfg-color.png",
        aiMode: false,
        showAiToggle: false,
        onAiMode: vi.fn(),
        onLaunch: vi.fn(),
      }),
    );

    expect(html).toContain("Buy a home");
    expect(html).not.toContain("AI mode");
    expect(html).not.toContain("Toggle AI mode");
  });

  it("preserves the AI composer and toggle when the feature is enabled", () => {
    const html = renderToStaticMarkup(
      createElement(RestingCard, {
        assistantName: "MSFG AI",
        shortName: "MSFG",
        iconSrc: "/brand/msfg-color.png",
        aiMode: true,
        showAiToggle: true,
        onAiMode: vi.fn(),
        onLaunch: vi.fn(),
      }),
    );

    expect(html).toContain("Ask me anything, or tell me what you want to do");
    expect(html).toContain("AI mode");
    expect(html).toContain("Toggle AI mode");
  });
});
