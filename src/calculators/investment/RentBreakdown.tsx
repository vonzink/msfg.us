import { formatUSD } from "@/lib/finance";
import { cn } from "@/lib/cn";
import { Swatch } from "../shared/Charts";

/** Where a normal rented month's rent goes. Costs first, what is left last. */
export function RentBreakdown({
  rent,
  expenses,
  mortgage,
  vacancy,
}: {
  rent: number;
  expenses: number;
  mortgage: number;
  vacancy: number;
}) {
  const left = rent - expenses - mortgage - vacancy;
  const parts = [
    { label: "Expenses", value: expenses, shown: expenses, color: "bg-chart-1" },
    { label: "Mortgage", value: mortgage, shown: mortgage, color: "bg-chart-2" },
    { label: "Vacancy", value: vacancy, shown: vacancy, color: "bg-chart-3" },
    { label: "Left for you", value: Math.max(0, left), shown: left, color: "bg-chart-4" },
  ];
  const total = Math.max(rent, expenses + mortgage + vacancy);
  const short = rent > 0 && left < 0;

  return (
    <figure className="m-0 min-w-0 rounded-lg border border-line bg-paper p-4">
      <figcaption className="mb-2.5 flex flex-wrap items-baseline justify-between gap-x-3.5 gap-y-1 text-[15px]">
        <strong>Where each month&apos;s rent goes</strong>
        {rent > 0 && (
          <span className={cn("text-[13px]", short ? "font-semibold text-loss" : "text-muted")}>
            {short ? `Short ${formatUSD(-left)} in a rented month` : `Of ${formatUSD(rent)} rent, in a rented month`}
          </span>
        )}
      </figcaption>
      <div
        role="img"
        aria-label={parts.map((p) => `${p.label} ${formatUSD(p.shown)}`).join(", ")}
        className="flex h-7 gap-0.5 overflow-hidden rounded-sm bg-paper-2"
      >
        {total > 0 &&
          parts
            .filter((p) => p.value > 0)
            .map((p) => (
              <span key={p.label} title={`${p.label}: ${formatUSD(p.value)}`} className={cn("min-w-0.5", p.color)} style={{ flex: p.value / total }} />
            ))}
      </div>
      <ul className="mt-3 grid list-none grid-cols-2 gap-x-4 gap-y-1.5 p-0 text-[13px] min-[601px]:grid-cols-4">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center">
            <Swatch className={p.color} />
            {p.label}
            <strong className={cn("ml-auto pl-2 tabular-nums", p.shown < 0 && "text-loss")}>{formatUSD(p.shown)}</strong>
          </li>
        ))}
      </ul>
    </figure>
  );
}
