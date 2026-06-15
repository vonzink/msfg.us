/**
 * Box-portable config publish — updates the PUBLISHED CONFIG revision's JSONB
 * directly via raw `pg` (no Prisma). Use this on the EC2 box, where RDS is
 * reachable but the standalone bundle's Prisma adapter deps aren't traced
 * (the Prisma-based scripts/update-msfg-staging-config.cjs fails there).
 *
 * Sets the real company contact (NMLS 1314257, phone, email, NMLS URL), the
 * registered office address, and repoints the sub-brand family-of-companies
 * cards to their routes. Idempotent. After running: pm2 restart msfg-web, then
 * redeploy main so the STATIC marketing pages rebuild against the new revision.
 *
 * RUN on the box (copy to ~/apps/msfg.us/ first; RDS reachable only from EC2):
 *   cd ~/apps/msfg.us
 *   DATABASE_URL=$(node -e 'const fs=require("fs");const m=fs.readFileSync(".env","utf8").match(/^DATABASE_URL=(.*)$/m);process.stdout.write(m?m[1].replace(/^[\x27"]|[\x27"]$/g,""):"")') \
 *     node update-msfg-rds-config.cjs
 *   pm2 restart msfg-web --update-env
 */
const { Client } = require("pg");

const cs = process.env.DATABASE_URL;
if (!cs) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const SUBBRAND_HREFS = {
  Veterans: "/veterans",
  Reverse: "/reverse",
  Investment: "/investment",
  Commercial: "/commercial",
};

(async () => {
  const client = new Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const sel = await client.query(
      `SELECT r.id, r.version, r.data
         FROM revisions r
         JOIN editables e ON r."editableId" = e.id
         JOIN tenants t ON e."tenantId" = t.id
        WHERE t.slug = 'msfg' AND e.kind = 'CONFIG' AND e."key" = 'default' AND r.state = 'PUBLISHED'
        ORDER BY r.version DESC
        LIMIT 1`,
    );
    if (sel.rows.length === 0) throw new Error("No PUBLISHED CONFIG revision found for tenant 'msfg'");
    const { id, version, data } = sel.rows[0];

    data.contact = {
      ...(data.contact || {}),
      phoneDisplay: "(720) 838-1246",
      phoneHref: "tel:+17208381246",
      email: "hello@msfg.us",
      nmls: "1314257",
      nmlsConsumerAccessUrl: "https://www.nmlsconsumeraccess.org/EntityDetails.aspx/COMPANY/1314257",
    };
    data.legal = {
      ...(data.legal || {}),
      address: "9035 Wadsworth Parkway, Suite 3400, Westminster, CO 80021",
    };
    if (data.marketing && Array.isArray(data.marketing.familyOfCompanies)) {
      data.marketing.familyOfCompanies = data.marketing.familyOfCompanies.map((c) =>
        c && SUBBRAND_HREFS[c.rest] ? { ...c, href: SUBBRAND_HREFS[c.rest] } : c,
      );
    }

    await client.query(`UPDATE revisions SET data = $1::jsonb WHERE id = $2`, [JSON.stringify(data), id]);
    console.log(
      `Updated published CONFIG revision v${version} (${id}): NMLS 1314257, phone (720) 838-1246, ` +
        "Westminster address, family cards repointed. Now: pm2 restart msfg-web --update-env",
    );
  } finally {
    await client.end();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
