// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { OfficerContactCard } from "./OfficerContactCard";

afterEach(cleanup);

describe("OfficerContactCard", () => {
  it("renders tel/sms/mailto links from the officer's real contact info", () => {
    render(
      <OfficerContactCard
        officer={{
          name: "Zachary Zink",
          nmls: "451924",
          photo: "/officers/zachary-zink.webp",
          email: "zachary.zink@msfg.us",
          phone: "(720) 838-1246",
        }}
      />,
    );
    expect(screen.getByRole("link", { name: /call/i })).toHaveAttribute("href", "tel:+17208381246");
    expect(screen.getByRole("link", { name: /text/i })).toHaveAttribute("href", "sms:+17208381246");
    expect(screen.getByRole("link", { name: /email/i })).toHaveAttribute("href", "mailto:zachary.zink@msfg.us");
    expect(screen.getByText("NMLS #451924")).toBeInTheDocument();
  });
});
