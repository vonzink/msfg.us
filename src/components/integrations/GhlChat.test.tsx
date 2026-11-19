// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GhlChat, isNoThirdPartyChatPath, NO_THIRD_PARTY_CHAT_PATHS } from "./GhlChat";

const BUDGET = "/calculators/budget";
const LOADER = "https://widgets.leadconnectorhq.com/loader.js";

let pathname = "/";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
/** next/script, as a plain element: what GhlChat asked to load, and nothing loaded. */
vi.mock("next/script", () => ({
  default: ({ id, src, strategy, ...rest }: Record<string, string>) => (
    <span data-testid="chat-script" data-script-id={id} data-src={src} data-strategy={strategy} {...rest} />
  ),
}));

const reload = vi.fn();
const asked = () => document.querySelector('[data-testid="chat-script"]');
/** The loader as next/script leaves it in the document once it has run: it outlives the component. */
function widgetLoaded(attributes: Record<string, string> = { id: "ghl-chat-widget", src: LOADER }) {
  const script = document.createElement("script");
  script.type = "text/plain"; // never fetched or run by jsdom
  for (const [name, value] of Object.entries(attributes)) script.setAttribute(name, value);
  document.body.appendChild(script);
}
/** Open the site on `from`, then move to `to` without a page load, as a link click does. */
function navigate(from: string, to: string) {
  pathname = from;
  const view = render(<GhlChat />);
  const move = (next: string) => {
    pathname = next;
    view.rerender(<GhlChat />);
  };
  return { ...view, move, arrive: () => move(to) };
}

beforeEach(() => {
  pathname = "/";
  reload.mockClear();
  vi.stubEnv("NEXT_PUBLIC_GHL_CHAT_WIDGET_ID", "widget-123");
  vi.stubGlobal("location", { ...window.location, reload });
});
afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("where the third-party chat widget must not run", () => {
  it("lists the Home budget calculator", () => {
    expect(NO_THIRD_PARTY_CHAT_PATHS).toContain(BUDGET);
  });

  it("matches a listed path exactly, with or without a trailing slash", () => {
    expect(isNoThirdPartyChatPath(BUDGET)).toBe(true);
    expect(isNoThirdPartyChatPath(`${BUDGET}/`)).toBe(true);
    for (const other of ["/", "", "/calculators", "/calculators/", "/calculators/mortgage", `${BUDGET}/print`, `${BUDGET}s`, `/en${BUDGET}`, "/Calculators/Budget"]) {
      expect(isNoThirdPartyChatPath(other), other).toBe(false);
    }
    expect(isNoThirdPartyChatPath(null)).toBe(false);
  });
});

describe("GhlChat", () => {
  it("renders nothing on /calculators/budget, with the widget configured", () => {
    for (const path of [BUDGET, `${BUDGET}/`]) {
      pathname = path;
      const { container } = render(<GhlChat />);
      expect(container.innerHTML, path).toBe("");
      expect(asked(), path).toBeNull();
      cleanup();
    }
    expect(reload).not.toHaveBeenCalled();
  });

  it("asks for the loader everywhere else, exactly as before", () => {
    for (const path of ["/", "/calculators", "/calculators/mortgage", "/apply"]) {
      pathname = path;
      render(<GhlChat />);
      const script = asked()!;
      expect(script, path).not.toBeNull();
      expect(script.getAttribute("data-script-id")).toBe("ghl-chat-widget");
      expect(script.getAttribute("data-src")).toBe(LOADER);
      expect(script.getAttribute("data-strategy")).toBe("lazyOnload");
      expect(script.getAttribute("data-widget-id")).toBe("widget-123");
      expect(script.getAttribute("data-resources-url")).toBe("https://widgets.leadconnectorhq.com/chat-widget/loader.js");
      cleanup();
    }
    expect(reload).not.toHaveBeenCalled();
  });

  it("renders nothing anywhere when the widget id is not set", () => {
    for (const id of ["", "   "]) {
      vi.stubEnv("NEXT_PUBLIC_GHL_CHAT_WIDGET_ID", id);
      for (const path of ["/", BUDGET]) {
        pathname = path;
        const { container } = render(<GhlChat />);
        expect(container.innerHTML).toBe("");
        cleanup();
      }
    }
    expect(reload).not.toHaveBeenCalled();
  });
});

describe("arriving on a listed path after the widget loaded on another page", () => {
  it("reloads the page once, and not again however often it renders", () => {
    const { arrive, move, container } = navigate("/", BUDGET);
    widgetLoaded();
    expect(reload).not.toHaveBeenCalled();
    arrive();
    expect(container.innerHTML).toBe("");
    expect(reload).toHaveBeenCalledTimes(1);
    move(BUDGET);
    move(`${BUDGET}/`);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("finds the widget by the script's id or by anything loaded from widgets.leadconnectorhq.com", () => {
    const signs: Record<string, string>[] = [{ id: "ghl-chat-widget" }, { src: LOADER }, { src: "https://widgets.leadconnectorhq.com/chat-widget/loader.js" }];
    for (const attributes of signs) {
      reload.mockClear();
      const { arrive } = navigate("/calculators/mortgage", BUDGET);
      widgetLoaded(attributes);
      arrive();
      expect(reload, JSON.stringify(attributes)).toHaveBeenCalledTimes(1);
      cleanup();
      document.body.innerHTML = "";
    }
  });

  it("does not reload when the script is not in the document", () => {
    const { arrive } = navigate("/", BUDGET);
    arrive();
    expect(reload).not.toHaveBeenCalled();
  });

  it("reloads once if the loader lands after the arrival: next/script loads it when the browser is idle and cannot be called off", async () => {
    const { arrive } = navigate("/", BUDGET);
    arrive();
    expect(reload).not.toHaveBeenCalled();
    widgetLoaded();
    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    widgetLoaded({ src: LOADER });
    await new Promise((done) => setTimeout(done, 0));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("does not reload on a page opened directly, even with the script present: that is the page a reload gives, so it cannot loop", async () => {
    widgetLoaded();
    pathname = BUDGET;
    const { rerender } = render(<GhlChat />);
    rerender(<GhlChat />);
    widgetLoaded({ src: LOADER });
    await new Promise((done) => setTimeout(done, 0));
    expect(reload).not.toHaveBeenCalled();
  });

  it("does not reload on other paths, with the script present", () => {
    const { move } = navigate("/", "/calculators/mortgage");
    widgetLoaded();
    move("/calculators/mortgage");
    move("/calculators");
    move("/");
    expect(reload).not.toHaveBeenCalled();
  });

  it("reloads again on a later arrival, once each", () => {
    const { arrive, move } = navigate("/", BUDGET);
    widgetLoaded();
    arrive();
    move("/calculators/mortgage");
    arrive();
    expect(reload).toHaveBeenCalledTimes(2);
  });
});
