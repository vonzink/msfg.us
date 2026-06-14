import type { TenantConfig } from "@/content/site";

/** Per-state licensing table. Renders the placeholder when a number is unset. */
export function LicenseTable({ config }: { config: TenantConfig }) {
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full border-collapse text-left text-[15px] text-ink">
        <thead>
          <tr className="border-b-2 border-line">
            <th className="py-2 pr-4 font-bold">State</th>
            <th className="py-2 font-bold">License</th>
          </tr>
        </thead>
        <tbody>
          {config.legal.states.map((s) => (
            <tr key={s.code} className="border-b border-line">
              <td className="py-2 pr-4">
                {s.name} ({s.code})
              </td>
              <td className="py-2">{s.licenseNumber ?? "License # [PLACEHOLDER]"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
