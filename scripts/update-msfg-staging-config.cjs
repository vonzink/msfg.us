/**
 * One-off ops script — write the REAL MSFG company contact details + registered
 * office address onto the PUBLISHED CONFIG revision in the connected database.
 *
 * Why this exists: getTenantConfig() reads the live PUBLISHED revision (not the
 * src/content/site.ts DEFAULT), and the /admin/config editor does NOT expose the
 * `legal` section (so the address can't be set from the UI). This mirrors the
 * scripts/update-logos.ts pattern: mutate the published revision's data JSON in
 * place via Prisma. Plain CommonJS so it runs with `node` on the EC2 box (where
 * the RDS is reachable and the standalone bundle already carries @prisma/*).
 *
 * RUN (on a host that can reach the DB — e.g. the EC2 box):
 *   cd ~/apps/msfg.us
 *   DATABASE_URL="$(grep -E '^DATABASE_URL=' .env | cut -d= -f2-)" node scripts/update-msfg-staging-config.cjs
 *   pm2 restart msfg-web --update-env     # flush Next.js ISR cache (script can't revalidateTag)
 *
 * The values below are confirmed from the live msfg.us site (2026-06-15).
 * Per-state license numbers are NOT published anywhere yet, so they stay
 * [PLACEHOLDER] until the company provides them.
 */
require("dotenv/config");
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is required (export it or put it in .env).");
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main() {
  const tenant = await prisma.tenant.findFirst({ where: { slug: "msfg" } });
  if (!tenant) throw new Error("MSFG tenant (slug='msfg') not found");

  const editable = await prisma.editable.findFirst({
    where: { tenantId: tenant.id, kind: "CONFIG", key: "default" },
  });
  if (!editable) throw new Error("CONFIG/default editable not found");

  const rev = await prisma.revision.findFirst({
    where: { editableId: editable.id, state: "PUBLISHED" },
    orderBy: { version: "desc" },
  });
  if (!rev) throw new Error("No PUBLISHED CONFIG revision found");

  const data = rev.data && typeof rev.data === "object" ? rev.data : {};
  data.contact = {
    ...(data.contact ?? {}),
    phoneDisplay: "(720) 838-1246",
    phoneHref: "tel:+17208381246",
    email: "hello@msfg.us",
    nmls: "1314257",
    nmlsConsumerAccessUrl:
      "https://www.nmlsconsumeraccess.org/EntityDetails.aspx/COMPANY/1314257",
  };
  data.legal = {
    ...(data.legal ?? {}),
    address: "9035 Wadsworth Parkway, Suite 3400, Westminster, CO 80021",
  };

  await prisma.revision.update({ where: { id: rev.id }, data: { data } });
  console.log(
    `Updated published CONFIG revision v${rev.version}: NMLS 1314257, phone (720) 838-1246, Westminster CO address.\n` +
      "Now run: pm2 restart msfg-web --update-env",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
