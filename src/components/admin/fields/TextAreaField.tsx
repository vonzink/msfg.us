"use client";

export function TextAreaField({
  label,
  name,
  value,
  onChange,
  rows = 3,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
}) {
  const id = `f-${name}`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[12px] font-bold uppercase tracking-[0.03em] text-muted">
        {label}
      </label>
      <textarea
        id={id}
        name={name}
        value={value}
        rows={rows}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border-[1.5px] border-line bg-paper px-3.5 py-2.5 text-[15px] text-ink outline-none focus:border-spring"
      />
    </div>
  );
}
