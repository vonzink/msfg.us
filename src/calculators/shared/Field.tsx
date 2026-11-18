"use client";

import { cn } from "@/lib/cn";
import { parseNumber, type FieldDef, type Numbers, type Values } from "./fields";

/**
 * One input: money, percent, number or text as a labelled text box (with an optional slider), or a
 * choice as a segmented control. `idPrefix` keeps ids unique when two calculators share a page.
 */
export function Field({ def, idPrefix, values, numbers, onChange, disabled = false, disabledHint }: {
  def: FieldDef;
  idPrefix: string;
  values: Values;
  numbers: Numbers;
  onChange: (id: string, value: string) => void;
  /** Keeps the value but greys the field out and ignores its warnings. */
  disabled?: boolean;
  /** Replaces the hint while disabled, to say why. */
  disabledHint?: string;
}) {
  const id = `${idPrefix}-${def.id}`;
  const value = values[def.id] ?? "";

  if (def.type === "choice") {
    return (
      <fieldset className="col-span-full m-0 flex min-w-0 flex-col gap-1.5 border-0 p-0">
        <legend className="mb-1.5 p-0 text-[13px] font-semibold">{def.label}</legend>
        <div className="grid auto-cols-fr grid-flow-col gap-[3px] rounded-md bg-paper-2 p-[3px]">
          {def.options?.map((o) => (
            <label
              key={o.value}
              className={cn(
                "relative cursor-pointer rounded-sm px-1.5 py-2 text-center text-[14px] font-semibold has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-spring-2",
                value === o.value ? "bg-green-600 text-white shadow-3d" : "text-muted",
              )}
            >
              <input
                type="radio" name={id} value={o.value} checked={value === o.value}
                onChange={() => onChange(def.id, o.value)}
                className="absolute inset-0 cursor-pointer opacity-0"
              />
              {o.label}
            </label>
          ))}
        </div>
        {def.hint && <span className="text-[12px] text-muted print:hidden">{def.hint}</span>}
      </fieldset>
    );
  }

  const suffix = def.type === "pct" ? "%" : def.suffix;
  const hint = disabled && disabledHint ? disabledHint : def.hintFn ? def.hintFn(numbers) : def.hint;
  const warning = disabled ? null : (def.warnFn?.(numbers) ?? null);
  const describedBy = [hint && `${id}-hint`, warning && `${id}-warn`].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", disabled && "opacity-60")}>
      <label htmlFor={id} className="text-[13px] font-semibold">{def.label}</label>
      <div
        className={cn(
          "flex items-center rounded-md border bg-white transition-shadow focus-within:border-spring-2 focus-within:shadow-[0_0_0_3px_var(--color-spring-soft)]",
          warning ? "border-loss" : "border-line",
          disabled && "bg-paper-2",
        )}
      >
        {def.type === "money" && <span aria-hidden="true" className="pl-2.5 text-[15px] font-semibold text-muted">$</span>}
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0"
          value={value}
          disabled={disabled}
          aria-describedby={describedBy}
          onChange={(e) => onChange(def.id, e.target.value)}
          onBlur={() => {
            if (def.type !== "money") return;
            const n = parseNumber(value);
            onChange(def.id, n ? n.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "");
          }}
          className="w-full min-w-0 flex-1 border-0 bg-transparent px-2.5 py-2.5 text-[16px] font-semibold tabular-nums text-ink outline-none placeholder:font-normal placeholder:text-muted/60 disabled:cursor-not-allowed"
        />
        {suffix && <span aria-hidden="true" className="pr-2.5 text-[15px] font-semibold text-muted">{suffix}</span>}
      </div>
      {def.slider && (
        <input
          type="range"
          aria-label={def.label}
          min={def.slider.min} max={def.slider.max} step={def.slider.step}
          value={parseNumber(value)}
          disabled={disabled}
          onChange={(e) => onChange(def.id, e.target.value)}
          className="mt-0.5 w-full accent-spring-2 disabled:cursor-not-allowed print:hidden"
        />
      )}
      {hint && <span id={`${id}-hint`} className="text-[12px] text-muted print:hidden">{hint}</span>}
      {warning && <span id={`${id}-warn`} className="text-[12px] font-semibold text-loss">{warning}</span>}
    </div>
  );
}
