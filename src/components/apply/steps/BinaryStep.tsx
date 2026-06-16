"use client";

import { cn } from "@/lib/cn";

/** USA TODAY award trust badge shown under the Yes/No buttons. */
function UsaTodayBadge() {
  return (
    <div className="mt-10 flex flex-col items-center gap-1.5 text-[13px] text-muted">
      <div className="flex items-center gap-2 font-extrabold text-ink">
        <span
          aria-hidden
          className="size-[22px] rounded-full bg-[#2D7FF9]"
        />
        USA TODAY
      </div>
      <div>2023 Best Mortgage Lenders</div>
    </div>
  );
}

export function BinaryStep({
  help,
  usatoday,
  selected,
  onPick,
  onAskAi,
}: {
  /** Optional underlined helper link text. */
  help?: string;
  usatoday?: boolean;
  selected?: string;
  onPick: (value: "Yes" | "No") => void;
  onAskAi?: () => void;
}) {
  return (
    <>
      {help && onAskAi && (
        <button
          type="button"
          onClick={onAskAi}
          className="-mt-1 mb-[26px] inline-block text-[15px] text-ink underline underline-offset-[3px]"
        >
          {help}
        </button>
      )}

      <div className="flex flex-col gap-3.5">
        {(["Yes", "No"] as const).map((v) => {
          const on = selected === v;
          return (
            <button
              key={v}
              type="button"
              aria-pressed={on}
              onClick={() => onPick(v)}
              className={cn(
                "h-16 rounded-lg border-[1.5px] text-[18px] font-bold transition-[transform,background,color,box-shadow,border-color] duration-150",
                on
                  ? "border-green-600 bg-green-600 text-white"
                  : "border-line bg-white text-ink shadow-3d hover:-translate-y-0.5 hover:border-green-600 hover:shadow-pop",
              )}
            >
              {v}
            </button>
          );
        })}
      </div>

      {usatoday && <UsaTodayBadge />}
    </>
  );
}
