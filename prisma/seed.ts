/**
 * Database seed — populates marketing content from the typed src/content/*
 * modules (single source of truth) plus a few placeholder testimonials.
 *
 * Idempotent: every write is an upsert on a natural key, so re-running keeps
 * the DB in sync with the content files without creating duplicates. Run with
 * `npm run db:seed` (tsx, which honors the @/* path alias).
 *
 * Run via the Prisma 7 driver adapter (see src/lib/db.ts) so it works against
 * the same Postgres connection the app uses.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

import { OFFICERS } from "@/content/officers";
import { RATE_DATA, type RateTab } from "@/content/rates";
import { CATS, type CategoryKey } from "@/content/categories";
import { DEFAULT_TENANT_CONFIG } from "@/content/site";
import type { Prisma } from "@prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required to seed the database");
}
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

// MSFG is tenant #1 — deterministic id shared with the migration backfill and
// the runtime resolver (src/server/tenant/resolve.ts). The seed runs outside a
// request (no tenant context), so it stamps tenantId explicitly on every row.
const TENANT_ID = "tenant_msfg";

/** content CategoryKey → Prisma Category enum. */
const CATEGORY_ENUM: Record<CategoryKey, "BUY" | "REFI" | "EQUITY"> = {
  buy: "BUY",
  refi: "REFI",
  equity: "EQUITY",
};

/** content rate tab → Prisma RateSegment enum. */
const SEGMENT_ENUM: Record<RateTab, "PURCHASE" | "REFINANCE"> = {
  purchase: "PURCHASE",
  refinance: "REFINANCE",
};

/** content applyIntent ("buy"|"refi") → Prisma Intent enum. */
const INTENT_ENUM: Record<"buy" | "refi", "BUY" | "REFI"> = {
  buy: "BUY",
  refi: "REFI",
};

/** Parse a points display string ("0.5 pts") into a numeric value. */
function parsePoints(points: string): number {
  const n = Number.parseFloat(points);
  return Number.isFinite(n) ? n : 0;
}

async function seedOfficers() {
  let i = 0;
  for (const o of OFFICERS) {
    const fields = {
      name: o.name,
      title: o.title,
      email: o.email,
      phone: o.phone,
      state: o.states[0] ?? null,
      licensedStates: o.states,
      bio: o.bio,
      photoUrl: o.photo,
      applyUrl: o.applyHref,
      sortOrder: i,
      active: true,
    };
    await prisma.loanOfficer.upsert({
      where: { tenantId_nmls: { tenantId: TENANT_ID, nmls: o.nmls } },
      update: fields,
      create: { tenantId: TENANT_ID, nmls: o.nmls, ...fields },
    });
    i++;
  }
  return OFFICERS.length;
}

async function seedPrograms() {
  let count = 0;
  for (const key of Object.keys(CATS) as CategoryKey[]) {
    const cat = CATS[key];
    let i = 0;
    for (const opt of cat.opts) {
      await prisma.loanProgram.upsert({
        where: {
          tenantId_category_name: {
            tenantId: TENANT_ID,
            category: CATEGORY_ENUM[key],
            name: opt.title,
          },
        },
        update: { blurb: opt.desc, bestFor: opt.audience, sortOrder: i },
        create: {
          tenantId: TENANT_ID,
          category: CATEGORY_ENUM[key],
          name: opt.title,
          blurb: opt.desc,
          bestFor: opt.audience,
          sortOrder: i,
        },
      });
      i++;
      count++;
    }
  }
  return count;
}

async function seedRates() {
  let count = 0;
  for (const tab of Object.keys(RATE_DATA) as RateTab[]) {
    const rows = RATE_DATA[tab];
    let i = 0;
    for (const r of rows) {
      await prisma.rateRow.upsert({
        where: {
          tenantId_segment_product_subLabel: {
            tenantId: TENANT_ID,
            segment: SEGMENT_ENUM[tab],
            product: r.product,
            subLabel: r.subLabel,
          },
        },
        update: {
          rate: r.rate,
          apr: r.apr,
          points: parsePoints(r.points),
          applyIntent: INTENT_ENUM[r.applyIntent],
          termMonths: r.termMonths,
          sortOrder: i,
        },
        create: {
          tenantId: TENANT_ID,
          segment: SEGMENT_ENUM[tab],
          product: r.product,
          subLabel: r.subLabel,
          rate: r.rate,
          apr: r.apr,
          points: parsePoints(r.points),
          applyIntent: INTENT_ENUM[r.applyIntent],
          termMonths: r.termMonths,
          sortOrder: i,
        },
      });
      i++;
      count++;
    }
  }
  return count;
}

/** Placeholder testimonials — replace with real, attributed reviews. */
const TESTIMONIALS = [
  {
    author: "Drew & Anya",
    quote:
      "Our loan officer made the whole process feel effortless — clear answers, fast updates, and we closed ahead of schedule.",
    context: "First-time buyers · Westminster, CO",
    rating: 5,
    surface: "apply",
    sortOrder: 0,
  },
  {
    author: "Marcus T.",
    quote:
      "Refinanced and dropped my payment by over $300 a month. They ran the break-even in plain English before I committed.",
    context: "Refinance · Fargo, ND",
    rating: 5,
    surface: "home",
    sortOrder: 1,
  },
  {
    author: "Priya R.",
    quote:
      "The digital HELOC was approved in days. No branch visits, no surprises — exactly what they promised.",
    context: "Home equity · Bismarck, ND",
    rating: 5,
    surface: "home",
    sortOrder: 2,
  },
];

async function seedTestimonials() {
  for (const t of TESTIMONIALS) {
    // No natural unique key on Testimonial; dedupe on (tenantId, author,
    // sortOrder) by clearing this tenant's placeholder set first, then
    // recreating. Safe & idempotent.
    await prisma.testimonial.deleteMany({
      where: { tenantId: TENANT_ID, author: t.author, sortOrder: t.sortOrder },
    });
    await prisma.testimonial.create({ data: { tenantId: TENANT_ID, ...t } });
  }
  return TESTIMONIALS.length;
}

async function seedConfigRevision() {
  const tenantId = TENANT_ID;
  // Seed from the tenant's stored config, else the bundled default.
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { config: true } });
  const data = (tenant?.config ?? DEFAULT_TENANT_CONFIG) as unknown as Prisma.InputJsonValue;

  const editable = await prisma.editable.upsert({
    where: { tenantId_kind_key: { tenantId, kind: "CONFIG", key: "default" } },
    update: {},
    create: { tenantId, kind: "CONFIG", key: "default" },
  });

  const existingPublished = await prisma.revision.findFirst({
    where: { tenantId, editableId: editable.id, state: "PUBLISHED" },
  });
  if (existingPublished) return; // idempotent — don't clobber edited config

  await prisma.revision.create({
    data: { tenantId, editableId: editable.id, version: 1, state: "PUBLISHED", data, publishedAt: new Date(), note: "Seed" },
  });
}

async function seedTenant() {
  // DEFAULT_TENANT_CONFIG is MSFG's config; cast through the Prisma JSON input
  // type so the structured object is accepted on the `config Json?` column.
  const config = DEFAULT_TENANT_CONFIG as unknown as Prisma.InputJsonValue;
  await prisma.tenant.upsert({
    where: { slug: "msfg" },
    update: { config },
    create: {
      id: TENANT_ID,
      slug: "msfg",
      name: "Mountain State Financial Group",
      config,
    },
  });
}

async function main() {
  await seedTenant();
  await seedConfigRevision();
  const officers = await seedOfficers();
  const programs = await seedPrograms();
  const rates = await seedRates();
  const testimonials = await seedTestimonials();
  console.log(
    `Seeded: ${officers} officers, ${programs} programs, ${rates} rate rows, ${testimonials} testimonials.`,
  );
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
