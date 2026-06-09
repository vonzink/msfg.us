/**
 * One-off: point the live published CONFIG revision's brand.logos at the new MSFG
 * Home Loans assets. The marketing homepage is statically prerendered, so the
 * build reads this revision — it must carry the new paths before deploy.
 *
 * Usage: npx tsx scripts/update-logos.ts   (reads DATABASE_URL from .env)
 *
 * Instantiates Prisma directly (the server-only getDb/versioning accessors can't
 * run outside Next — same pattern as seal-secret.ts).
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("ERROR: DATABASE_URL is required.");
  process.exit(1);
}

const LOGOS = {
  horizontal: "/brand/msfg-color.png",
  mark: "/brand/msfg-hl-clearbg.png",
};

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  const tenant = await prisma.tenant.findFirst({ where: { slug: "msfg" } });
  if (!tenant) throw new Error("MSFG tenant not found");

  const editable = await prisma.editable.findFirst({
    where: { tenantId: tenant.id, kind: "CONFIG", key: "default" },
  });
  if (!editable) throw new Error("CONFIG/default editable not found");

  const rev = await prisma.revision.findFirst({
    where: { editableId: editable.id, state: "PUBLISHED" },
    orderBy: { version: "desc" },
  });
  if (!rev) throw new Error("no published CONFIG revision");

  const data = (rev.data ?? {}) as Record<string, unknown>;
  const brand = (data.brand ?? {}) as Record<string, unknown>;
  const logos = (brand.logos ?? {}) as Record<string, unknown>;
  brand.logos = { ...logos, ...LOGOS };
  data.brand = brand;

  await prisma.revision.update({ where: { id: rev.id }, data: { data: data as object } });
  console.log(
    `✓ updated published CONFIG revision ${rev.id} (v${rev.version}); logos =`,
    JSON.stringify(brand.logos),
  );
}

main()
  .catch((err) => {
    console.error("update-logos failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
