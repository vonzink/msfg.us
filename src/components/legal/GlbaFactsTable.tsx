/** A row of the GLBA "Facts" sharing matrix. */
export type GlbaShareRow = {
  reason: string;
  shares: "Yes" | "No";
  canLimit: "Yes" | "No" | "We don't share";
};

/** The standardized GLBA financial-privacy sharing table. */
export function GlbaFactsTable({ rows }: { rows: GlbaShareRow[] }) {
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full border-collapse text-left text-[15px] text-ink">
        <thead>
          <tr className="border-b-2 border-line">
            <th className="py-2 pr-4 font-bold">Reasons we can share your personal information</th>
            <th className="py-2 pr-4 font-bold">Does {`MSFG`} share?</th>
            <th className="py-2 font-bold">Can you limit this sharing?</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-line align-top">
              <td className="py-2 pr-4">{r.reason}</td>
              <td className="py-2 pr-4 font-semibold">{r.shares}</td>
              <td className="py-2">{r.canLimit}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
