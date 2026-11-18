export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "30 years", "20 years 5 months", "7 months". */
export function duration(months: number): string {
  const y = Math.floor(months / 12);
  const m = months % 12;
  const years = y ? `${y} year${y === 1 ? "" : "s"}` : "";
  const rest = m ? `${m} month${m === 1 ? "" : "s"}` : "";
  return [years, rest].filter(Boolean).join(" ") || "0 months";
}
