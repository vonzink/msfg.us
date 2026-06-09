import { requireRole } from "@/server/admin/access";
import { getDb } from "@/lib/db";
import { importOfficersFromS3Action } from "./actions";

export default async function AdminOfficersPage() {
  const ctx = await requireRole("EDITOR");
  const count = await getDb().loanOfficer.count({
    where: { tenantId: ctx.tenant.id, active: true },
  });

  return (
    <div className="wrap" style={{ paddingBlock: "2rem" }}>
      <h1>Loan officers</h1>
      <p>
        {count} active officer{count === 1 ? "" : "s"}. Re-import from the S3 roster
        (<code>rag-brain/MSFG_Loan_Officers.md</code>) after editing it.
      </p>
      <form
        action={async () => {
          "use server";
          await importOfficersFromS3Action();
        }}
      >
        <button type="submit" className="press-3d">
          Import from S3
        </button>
      </form>
    </div>
  );
}
