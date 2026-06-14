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
import { SITE } from "@/content/site";

const envSchema = z.object({
  // Database (system-of-record).
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  DIRECT_URL: z.string().min(1).optional(),

  // Multi-tenancy. dedicated = one pinned tenant (TENANT_SLUG); shared = resolve
  // the tenant from the request host. MSFG runs dedicated/msfg → zero change.
  TENANT_MODE: z.enum(["dedicated", "shared"]).default("dedicated"),
  TENANT_SLUG: z.string().min(1).default("msfg"),

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

  // DeepSeek (OpenAI-compatible) — powers the "Ask MSFG AI" assistant. Optional:
  // the homepage assistant degrades to a graceful "unavailable" path when
  // DEEPSEEK_API_KEY is absent. DEEPSEEK_BASE_URL / DEEPSEEK_MODEL let you point
  // at any OpenAI-compatible endpoint (DeepSeek by default). Tool calling needs
  // the `deepseek-chat` model — `deepseek-reasoner` does NOT support functions.
  DEEPSEEK_API_KEY: z.string().min(1).optional(),
  DEEPSEEK_BASE_URL: z.string().url().default("https://api.deepseek.com"),
  DEEPSEEK_MODEL: z.string().min(1).default("deepseek-chat"),

  // Google Places (New) server key — optional. When absent, the address step
  // degrades to a validated free-text field. Restrict the key to the Places
  // API in Google Cloud.
  GOOGLE_PLACES_API_KEY: z.string().min(1).optional(),

  // -------------------------------------------------------------------------
  // AWS Cognito SSO (OPTIONAL — every var is optional so the site builds/runs
  // with NO auth configured). Auth is treated as "configured" only when an app
  // client id AND a Hosted UI domain are present (see authConfigured()). The
  // user pool is shared with app.msfgco.com (region us-west-1, pool
  // us-west-1_S6iE2uego) — defaults match so only the per-site client id +
  // domain + callback URLs must be supplied. Server-only; never NEXT_PUBLIC_*.
  // -------------------------------------------------------------------------
  COGNITO_REGION: z.string().min(1).default("us-west-1"),
  COGNITO_USER_POOL_ID: z.string().min(1).default("us-west-1_S6iE2uego"),
  // Dedicated app client registered for msfg.us (user-supplied).
  COGNITO_CLIENT_ID: z.string().min(1).optional(),
  // Set only for a CONFIDENTIAL client → sent as HTTP Basic on the token
  // endpoint (client_secret_basic). Omit for a public (PKCE-only) client.
  COGNITO_CLIENT_SECRET: z.string().min(1).optional(),
  // Hosted UI / managed login domain, e.g.
  // https://<prefix>.auth.us-west-1.amazoncognito.com (no trailing slash).
  COGNITO_HOSTED_UI_DOMAIN: z
    .string()
    .url()
    .optional()
    .transform((v) => (v ? v.replace(/\/+$/, "") : v)),
  // Space-delimited OAuth scopes. `openid` is required to receive an id_token.
  COGNITO_SCOPES: z.string().min(1).default("openid email profile"),
  // OAuth redirect (callback) URI — MUST be registered as an Allowed callback
  // URL on the Cognito app client. Defaults to ${SITE.url}/auth/callback.
  AUTH_REDIRECT_URI: z.string().url().optional(),
  // Post-logout redirect — MUST be registered as an Allowed sign-out URL on the
  // app client. Defaults to ${SITE.url}.
  AUTH_LOGOUT_REDIRECT_URI: z.string().url().optional(),

  // -------------------------------------------------------------------------
  // Loan Origination System (LOS) hand-off (OPTIONAL). When LOS_API_BASE is
  // unset the hand-off is DISABLED (no network call) and the wizard still
  // captures the lead/application exactly as before. The base is the full URL
  // the application POST is sent to; the exact path is a one-line change in
  // losClient.ts. Authenticated with the Cognito id_token as a Bearer (matches
  // app.msfgco.com / dashboard.msfgco.com, whose access tokens lack `email`).
  // -------------------------------------------------------------------------
  LOS_API_BASE: z.string().url().optional(),

  // -------------------------------------------------------------------------
  // Public partner API (`/api/v1/public/*`) — OPTIONAL. This is the versioned,
  // key-authenticated API for external integrators (distinct from the site's
  // own same-origin internal endpoints, which remain key-free). Every var is
  // optional so the API degrades gracefully with no config (see
  // publicApiConfigured()): READ endpoints stay open + rate-limited; key-gated
  // WRITE endpoints return 503 "Public API not enabled". Server-only.
  // -------------------------------------------------------------------------
  // Comma-separated API keys. Each entry is either a bare key (`<key>`) or a
  // `keyId:key:secret` triple. The optional `secret` enables HMAC on WRITE
  // endpoints (x-signature: sha256=HMAC-SHA256(secret, rawBody)). When unset
  // (and no DB ApiKey rows exist) the public API is treated as NOT enabled.
  MSFG_API_KEYS: z.string().min(1).optional(),
  // Requests-per-minute for the in-memory token-bucket limiter, keyed by
  // (apiKey || client IP). Default 60.
  PUBLIC_API_RATE_RPM: z.coerce.number().int().positive().default(60),
  // Comma-separated allowed CORS origins for the public API. Default "*"
  // (reads are public). Set explicit origins to lock down browser callers.
  PUBLIC_API_CORS_ORIGINS: z.string().min(1).default("*"),

  // Generic HMAC webhook example secret (OPTIONAL). When set, the `hmac`
  // provider at POST /api/v1/webhooks/hmac verifies x-signature against this
  // shared secret (HMAC-SHA256 of the raw body); unset → that provider is a
  // permissive-off-production no-op, matching the other generic providers.
  GENERIC_WEBHOOK_SECRET: z.string().min(1).optional(),

  // Sentry DSN (OPTIONAL, follow-up seam). The Sentry SDK is intentionally NOT
  // installed yet to keep deps light; captureError() in src/lib/log.ts no-ops
  // unless this is wired. Provided here so ops can configure it ahead of time.
  SENTRY_DSN: z.string().min(1).optional(),

  // Per-tenant secret envelope key (OPTIONAL — app boots without it; the
  // EnvelopeAesSecretStore throws only when seal/open is actually called).
  // Generate: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
  TENANT_SECRETS_KEY: z.string().optional(),

  // Comma-separated emails granted platform-admin on first sign-in (bootstrap
  // before any Membership row exists). Lower-cased + matched case-insensitively.
  ADMIN_BOOTSTRAP_EMAILS: z.string().optional(),
});

export type ServerEnv = z.infer<typeof envSchema>;

let cached: ServerEnv | null = null;

/** Parse + cache env on first use. Throws a readable error if invalid. */
function loadEnv(): ServerEnv {
  if (cached) return cached;
  // Treat empty-string vars as unset. Deploy platforms (Vercel, containers,
  // shells) commonly pass an "unset" optional var as "", which would otherwise
  // fail the optional `.min(1)` checks and 500 every env-reading route.
  const raw: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (typeof v === "string" && v !== "") raw[k] = v;
  }
  const parsed = envSchema.safeParse(raw);
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
 * True only when the DeepSeek API key is present. When false, the homepage
 * assistant returns a friendly "unavailable" path instead of calling the model,
 * so the site builds/runs with no key configured.
 */
export function aiConfigured(): boolean {
  return Boolean(loadEnv().DEEPSEEK_API_KEY);
}

/**
 * True only when Cognito SSO has the minimum config to start an OIDC flow: a
 * registered app client id AND a Hosted UI domain. When false, the auth route
 * handlers return a clear "not configured" response and the apply wizard's
 * account step stays the existing mock — the site builds/runs with no Cognito
 * config. (A confidential client also needs COGNITO_CLIENT_SECRET, but that is
 * validated at the token-exchange call site, not here.)
 */
export function authConfigured(): boolean {
  const e = loadEnv();
  return Boolean(e.COGNITO_CLIENT_ID && e.COGNITO_HOSTED_UI_DOMAIN);
}

/** True when the LOS hand-off is configured (base URL present). */
export function losConfigured(): boolean {
  return Boolean(loadEnv().LOS_API_BASE);
}

/**
 * True when the public partner API has at least one configured key source:
 * env `MSFG_API_KEYS` is set. (DB-backed `ApiKey` rows are an additional,
 * async source checked at request time in src/server/api/auth.ts — they can
 * enable individual keys even when this returns false, but we keep this helper
 * synchronous + env-only so server components and the WRITE-gate can call it
 * cheaply.) When false: READ endpoints still work (open + rate-limited) and
 * key-gated WRITE endpoints return 503 "Public API not enabled".
 */
export function publicApiConfigured(): boolean {
  return Boolean(loadEnv().MSFG_API_KEYS);
}

/**
 * Resolved Cognito/auth config with derived defaults applied (issuer, JWKS URI,
 * redirect/logout URIs). Throws (via the readable env error) only on access, so
 * importing this module never fails the build. Call sites should guard with
 * `authConfigured()` first. `SITE.url` is the canonical origin used for the
 * redirect/logout defaults when the explicit env vars are unset.
 */
export function getCognitoConfig() {
  const e = loadEnv();
  const region = e.COGNITO_REGION;
  const userPoolId = e.COGNITO_USER_POOL_ID;
  return {
    region,
    userPoolId,
    clientId: e.COGNITO_CLIENT_ID,
    clientSecret: e.COGNITO_CLIENT_SECRET,
    hostedUiDomain: e.COGNITO_HOSTED_UI_DOMAIN,
    scopes: e.COGNITO_SCOPES,
    redirectUri: e.AUTH_REDIRECT_URI ?? `${SITE.url}/auth/callback`,
    logoutRedirectUri: e.AUTH_LOGOUT_REDIRECT_URI ?? SITE.url,
    /** OIDC issuer — full Cognito IdP endpoint (matches Spring resource server). */
    issuer: `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`,
    /** JWKS endpoint for id_token signature verification. */
    jwksUri: `https://cognito-idp.${region}.amazonaws.com/${userPoolId}/.well-known/jwks.json`,
  };
}
