// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { Field } from "./Field";
import type { FieldDef } from "./fields";

afterEach(cleanup);

function Box({ def }: { def: FieldDef }) {
  const [values, setValues] = useState<Record<string, string>>({ [def.id]: "" });
  return <Field def={def} idPrefix="t" values={values} numbers={{}} onChange={(id, value) => setValues((v) => ({ ...v, [id]: value }))} />;
}
/** Types into the box and leaves it; returns what the box then holds. */
const typed = (text: string) => {
  const input = screen.getByLabelText("Amount") as HTMLInputElement;
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: text } });
  fireEvent.blur(input);
  return input.value;
};

describe("a money box when focus leaves it", () => {
  it("empties a typed 0 by default", () => {
    render(<Box def={{ id: "a", label: "Amount", type: "money", example: "" }} />);
    expect(typed("0")).toBe("");
    expect(typed("4800")).toBe("4,800");
    expect(typed("abc")).toBe("");
  });

  it("keeps a typed 0 when the field has keepZero", () => {
    render(<Box def={{ id: "a", label: "Amount", type: "money", example: "", keepZero: true }} />);
    expect(typed("0")).toBe("0");
    expect(typed("0.00")).toBe("0");
    expect(typed("4800")).toBe("4,800");
    expect(typed("abc")).toBe("");
    expect(typed("")).toBe("");
  });

  it("leaves a percent box alone", () => {
    render(<Box def={{ id: "a", label: "Amount", type: "pct", example: "", keepZero: true }} />);
    expect(typed("0")).toBe("0");
    expect(typed("6.50")).toBe("6.50");
  });
});

describe("a read-only box", () => {
  const def: FieldDef = { id: "a", label: "Amount", type: "money", example: "", hint: "Per month." };
  const changes: string[] = [];
  const show = (props: { readOnly?: boolean; readOnlyHint?: string; disabled?: boolean; disabledHint?: string }) =>
    render(<Field def={def} idPrefix="t" values={{ a: "0" }} numbers={{}} onChange={(_id, value) => changes.push(value)} {...props} />);
  const input = () => screen.getByLabelText("Amount") as HTMLInputElement;

  it("shows its value at full contrast, can be reached, and is never written to", () => {
    changes.length = 0;
    const { container } = show({ readOnly: true, readOnlyHint: "Worked out for you." });
    expect(input().readOnly).toBe(true);
    expect(input().disabled).toBe(false);
    expect(input().getAttribute("aria-readonly")).toBe("true");
    expect(input().placeholder).toBe("");
    expect(container.innerHTML).not.toContain("opacity-60");
    expect(container.textContent).toContain("Worked out for you.");
    expect(container.textContent).not.toContain("Per month.");
    fireEvent.focus(input());
    fireEvent.change(input(), { target: { value: "5" } });
    fireEvent.blur(input());
    expect(changes).toEqual([]);
  });

  it("leaves a disabled box as it was: greyed out, with the placeholder and its own hint", () => {
    const { container } = show({ disabled: true, disabledHint: "Not used." });
    expect(input().disabled).toBe(true);
    expect(input().readOnly).toBe(false);
    expect(input().getAttribute("aria-readonly")).toBeNull();
    expect(input().placeholder).toBe("0");
    expect(container.innerHTML).toContain("opacity-60");
    expect(container.textContent).toContain("Not used.");
  });

  it("leaves an ordinary box as it was", () => {
    changes.length = 0;
    show({});
    expect(input().readOnly).toBe(false);
    expect(input().getAttribute("aria-readonly")).toBeNull();
    expect(input().placeholder).toBe("0");
    fireEvent.blur(input());
    expect(changes).toEqual([""]);
  });
});
