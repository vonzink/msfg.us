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
