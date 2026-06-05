"use client";

import { Switch } from "@/components/ui/Switch";

export function SwitchField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border border-line bg-paper px-3.5 py-3">
      <span className="text-[14px] font-semibold text-ink">{label}</span>
      <Switch checked={checked} onChange={onChange} label={label} />
    </div>
  );
}
