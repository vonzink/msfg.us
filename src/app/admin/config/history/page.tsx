import { requireRole } from "@/server/admin/access";
import { listHistory } from "@/server/cms/versioning";
import { rollbackConfigAction } from "../actions";

export default async function ConfigHistoryPage() {
  const ctx = await requireRole("EDITOR");
  const revisions = await listHistory(ctx.tenant.id, "CONFIG", "default");

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-extrabold">Config history</h1>
      <table className="mt-6 w-full text-[14px]">
        <thead>
          <tr className="border-b border-line text-left text-muted">
            <th className="py-2 font-semibold">Version</th>
            <th className="font-semibold">State</th>
            <th className="font-semibold">Saved</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {revisions.map((r) => (
            <tr key={r.id} className="border-b border-line">
              <td className="py-2 font-semibold">v{r.version}</td>
              <td>{r.state}</td>
              <td>{new Date(r.createdAt).toLocaleString()}</td>
              <td className="text-right">
                <form
                  action={async () => {
                    "use server";
                    await rollbackConfigAction(r.version);
                  }}
                >
                  <button type="submit" className="font-semibold text-spring-2 hover:underline">
                    Restore to draft
                  </button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-4 text-[13px] text-muted">
        Restoring copies that version into a new draft. Review it in the editor, then Publish.
      </p>
    </div>
  );
}
