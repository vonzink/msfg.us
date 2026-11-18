import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AskAiLauncher } from "./AskAiLauncher";

const props = {
  starters: ["What can I afford?"],
  assistantName: "MSFG AI",
  shortName: "MSFG",
  iconSrc: "/brand/msfg-hl-clearbg.png",
};

describe("AskAiLauncher", () => {
  it("renders no chat entry point when the frontend option is disabled", () => {
    const html = renderToStaticMarkup(
      createElement(AskAiLauncher, { ...props, enabled: false }),
    );

    expect(html).not.toContain("Ask AI");
    expect(html).not.toContain("Ask MSFG AI");
  });

  it("preserves the chat launcher for later re-enablement", () => {
    const html = renderToStaticMarkup(
      createElement(AskAiLauncher, { ...props, enabled: true }),
    );

    expect(html).toContain("Ask AI");
    expect(html).toContain("Ask MSFG AI");
  });
});
