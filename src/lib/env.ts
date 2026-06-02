/**
 * Server-only, zod-validated environment accessor.
 *
 * Parsed lazily so importing this module never throws at build/SSG time —
 * `serverEnv` is a getter-backed proxy that validates on first property read.
 * Only `DATABASE_URL` is required; every GHL var is optional and the CRM
 * integration is treated as "not configured" when the token/location are
 * absent. Never read NEXT_PUBLIC_* here (those belong to the client bundle).
 *
 * Server-only: this module reads process.env secrets and must never be
 * imported into a Client Component. (We avoid the `server-only` package to
 * keep deps minimal; keep imports of this file inside route handlers /
 * server modules.)
 */
import { z } from "zod";

const envSchema = z.object({
  // Database (system-of-record).
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  DIRECT_URL: z.string().min(1).optional(),

  // Go High Level / LeadConnector (optional — sync disabled when unset).
  GHL_API_BASE: z
    .string()
    .url()
    .default("https://services.leadconnectorhq.com"),
  GHL_API_VERSION: z.string().min(1).default("2021-07-28"),
  GHL_API_TOKEN: z.string().min(1).optional(),
  GHL_LOCATION_ID: z.string().min(1).optional(),
  GHL_PIPELINE_ID: z.string().min(1).optional(),
  GHL_STAGE_ID: z.string().min(1).optional(),

  // Protects the internal retry-cron endpoint when set.
  CRON_SECRET: z.string().min(1).optional(),
});

export type ServerEnv = z.infer<typeof envSchema>;

let cached: ServerEnv | null = null;

/** Parse + cache env on first use. Throws a readable error if invalid. */
function loadEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid server environment:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/**
 * Lazily-validated env. Reading any property triggers (and caches) validation,
 * so a bad/missing env only fails the request that needs it — not the build.
 */
export const serverEnv: ServerEnv = new Proxy({} as ServerEnv, {
  get(_target, prop: string) {
    return loadEnv()[prop as keyof ServerEnv];
  },
});

/** True only when GHL has the minimum creds to make an authenticated call. */
export function ghlConfigured(): boolean {
  const e = loadEnv();
  return Boolean(e.GHL_API_TOKEN && e.GHL_LOCATION_ID);
}
