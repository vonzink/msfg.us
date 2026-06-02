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

  // Inbound GHL webhooks (two-way sync) — verification is OPTIONAL and
  // mode-selected by which of these is set. Inbound is DISABLED (deliveries
  // accepted but not processed) when none of the three is configured:
  //   • GHL_WEBHOOK_SECRET        → HMAC-SHA256 of the raw body (custom/
  //     automation webhooks that sign with a shared secret).
  //   • GHL_WEBHOOK_PUBLIC_KEY    → override the built-in marketplace public
  //     key used to verify GHL's RSA (X-WH-Signature) / Ed25519
  //     (X-GHL-Signature) signatures. Leave unset to use the documented
  //     GHL public keys baked into the verifier.
  //   • GHL_WEBHOOK_PUBLIC_KEY_VERIFY → set "true" to require public-key
  //     verification using the built-in GHL keys even without an override key.
  GHL_WEBHOOK_SECRET: z.string().min(1).optional(),
  GHL_WEBHOOK_PUBLIC_KEY: z.string().min(1).optional(),
  GHL_WEBHOOK_PUBLIC_KEY_VERIFY: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),

  // Protects the internal retry-cron endpoint when set.
  CRON_SECRET: z.string().min(1).optional(),

  // Anthropic / Claude API (optional — the homepage assistant degrades to a
  // graceful "unavailable" path when ANTHROPIC_API_KEY is absent). The SDK
  // reads ANTHROPIC_API_KEY itself; we validate its presence here only to gate
  // the feature. ANTHROPIC_BASE_URL points the SDK at an internal gateway
  // (hybrid setups); omit it to hit api.anthropic.com directly.
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  ANTHROPIC_BASE_URL: z.string().url().optional(),
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

/**
 * True when inbound GHL webhook verification is enabled. We process inbound
 * deliveries only when at least one verification mode is configured: an HMAC
 * shared secret, a public-key override, or the explicit "verify with built-in
 * GHL keys" flag. With none set, inbound is treated as DISABLED — the route
 * acknowledges the delivery (200) but runs no side effects, so the site is
 * safe by default with no GHL credentials.
 */
export function ghlInboundConfigured(): boolean {
  const e = loadEnv();
  return Boolean(
    e.GHL_WEBHOOK_SECRET ||
      e.GHL_WEBHOOK_PUBLIC_KEY ||
      e.GHL_WEBHOOK_PUBLIC_KEY_VERIFY,
  );
}

/**
 * True only when the Claude API key is present. When false, the homepage
 * assistant returns a friendly "unavailable" path instead of calling the model,
 * so the site builds/runs with no key configured.
 */
export function aiConfigured(): boolean {
  return Boolean(loadEnv().ANTHROPIC_API_KEY);
}
