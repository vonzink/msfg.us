// Prisma 7 CLI config. In v7 the datasource URL moved out of schema.prisma
// into this file — it is what `prisma migrate` / `prisma db` use for the
// direct (non-pooled) connection. The runtime app client connects separately
// via a driver adapter in src/lib/db.ts using DATABASE_URL.
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Migrations should use a direct connection when one is provided
    // (e.g. Supabase/Neon poolers); fall back to DATABASE_URL otherwise.
    url: env("DIRECT_URL") ?? env("DATABASE_URL"),
  },
});
