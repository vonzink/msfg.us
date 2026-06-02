/**
 * GET /api/v1/public/openapi.json — hand-written OpenAPI 3.1 document for the
 * MSFG public partner API. Describes the four public endpoints, the
 * x-api-key / HMAC auth schemes, the rate-limit headers, and response shapes.
 * `servers[].url` is derived from SITE.url so the spec points at the right host
 * per environment. Open + rate-limited like the other reads.
 */
import { SITE } from "@/content/site";
import { serverEnv } from "@/lib/env";
import { preflight, withPublicApi } from "@/server/api/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Reusable envelope refs. */
const okEnvelope = (dataRef: object) => ({
  type: "object",
  required: ["ok", "data"],
  properties: { ok: { type: "boolean", enum: [true] }, data: dataRef },
});

function buildSpec() {
  const rpm = serverEnv.PUBLIC_API_RATE_RPM;

  const rateLimitHeaders = {
    "X-RateLimit-Limit": {
      schema: { type: "integer" },
      description: "Max requests per minute for your key/IP bucket.",
    },
    "X-RateLimit-Remaining": {
      schema: { type: "integer" },
      description: "Requests remaining in the current window.",
    },
    "X-RateLimit-Reset": {
      schema: { type: "integer" },
      description: "Unix seconds when the bucket refills.",
    },
  } as const;

  const errorResponse = {
    description: "Error envelope.",
    content: {
      "application/json": {
        schema: {
          type: "object",
          required: ["ok", "error"],
          properties: {
            ok: { type: "boolean", enum: [false] },
            error: { type: "string" },
          },
        },
      },
    },
  } as const;

  const rateRow = {
    type: "object",
    properties: {
      product: { type: "string", example: "30-Year Fixed" },
      subLabel: { type: "string", example: "Conventional" },
      rate: { type: "number", example: 6.375 },
      apr: { type: "number", example: 6.512 },
      points: { type: "string", example: "0.5 pts" },
      applyIntent: { type: "string", enum: ["buy", "refi"] },
      termMonths: { type: "integer", example: 360 },
      estimatedMonthly: {
        type: "integer",
        description: "Estimated monthly P&I on `principal`, whole dollars.",
        example: 1872,
      },
    },
  };

  return {
    openapi: "3.1.0",
    info: {
      title: "MSFG Public API",
      version: "1.0.0",
      description:
        "Versioned, key-authenticated public API for MSFG partners. " +
        "Read endpoints are open and rate-limited; the lead-intake write " +
        "endpoint requires an API key (and HMAC when your key has a secret). " +
        `Default rate limit: ${rpm} requests/minute per key or client IP. ` +
        "Every response uses a JSON envelope: `{ ok, data }` on success, " +
        "`{ ok:false, error }` on failure. Rate-limit headers " +
        "(X-RateLimit-Limit/Remaining/Reset) accompany every response; a 429 " +
        "adds Retry-After.",
      contact: { name: "MSFG", email: SITE.email, url: SITE.url },
    },
    servers: [{ url: `${SITE.url}/api/v1/public`, description: "Public API v1" }],
    tags: [
      { name: "Rates", description: "Today's mortgage rates." },
      { name: "Programs", description: "Loan programs." },
      { name: "Loan Officers", description: "Public loan-officer directory." },
      { name: "Leads", description: "Partner lead intake (write)." },
    ],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: "apiKey",
          in: "header",
          name: "x-api-key",
          description:
            "Your MSFG-issued API key. Required for write endpoints.",
        },
        HmacSignature: {
          type: "apiKey",
          in: "header",
          name: "x-signature",
          description:
            "HMAC signature for write endpoints when your key has a secret: " +
            "`sha256=<hex>` where hex = HMAC-SHA256(yourSecret, rawRequestBody). " +
            "Compared constant-time server-side.",
        },
      },
      schemas: {
        RatesData: {
          type: "object",
          properties: {
            updatedAt: { type: "string", example: "June 1, 2026 · 8:00 AM MT" },
            principal: { type: "integer", example: 300000 },
            currency: { type: "string", example: "USD" },
            purchase: { type: "array", items: rateRow },
            refinance: { type: "array", items: rateRow },
          },
        },
        ProgramsData: {
          type: "object",
          properties: {
            programs: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  category: { type: "string", enum: ["buy", "refi", "equity"] },
                  intent: { type: "string", enum: ["buy", "refi", "cash"] },
                  name: { type: "string", example: "Conventional" },
                  blurb: { type: "string" },
                  bestFor: { type: "string", example: "First-time buyers" },
                },
              },
            },
          },
        },
        LoanOfficersData: {
          type: "object",
          properties: {
            loanOfficers: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  nmls: { type: "string" },
                  city: { type: "string" },
                  state: { type: "string", example: "CO" },
                  languages: { type: "array", items: { type: "string" } },
                  specialties: { type: "array", items: { type: "string" } },
                  rating: {
                    type: "object",
                    properties: {
                      average: { type: "number", example: 4.9 },
                      count: { type: "integer", example: 184 },
                    },
                  },
                },
              },
            },
          },
        },
        LeadInput: {
          type: "object",
          required: ["intent", "contact", "consentTcpa", "idempotencyKey"],
          properties: {
            intent: { type: "string", enum: ["buy", "refi", "cash"] },
            contact: {
              type: "object",
              required: ["firstName", "lastName", "email", "phone"],
              properties: {
                firstName: { type: "string" },
                lastName: { type: "string" },
                email: { type: "string", format: "email" },
                phone: { type: "string" },
              },
            },
            answers: { type: "object", additionalProperties: true },
            location: { type: "string" },
            consentTcpa: { type: "boolean" },
            idempotencyKey: {
              type: "string",
              description: "A UUID or any opaque string ≥ 16 chars.",
            },
            source: { type: "string", default: "web" },
          },
        },
        LeadResult: {
          type: "object",
          properties: {
            leadId: { type: "string" },
            syncStatus: {
              type: "string",
              enum: ["PENDING", "SYNCED", "FAILED", "SKIPPED"],
            },
          },
        },
      },
    },
    paths: {
      "/rates": {
        get: {
          tags: ["Rates"],
          summary: "Today's mortgage rates",
          security: [],
          responses: {
            "200": {
              description: "Current purchase + refinance rates.",
              headers: rateLimitHeaders,
              content: {
                "application/json": {
                  schema: okEnvelope({
                    $ref: "#/components/schemas/RatesData",
                  }),
                },
              },
            },
            "429": { ...errorResponse, description: "Rate limit exceeded." },
          },
        },
      },
      "/programs": {
        get: {
          tags: ["Programs"],
          summary: "Loan programs",
          security: [],
          responses: {
            "200": {
              description: "Available loan programs.",
              headers: rateLimitHeaders,
              content: {
                "application/json": {
                  schema: okEnvelope({
                    $ref: "#/components/schemas/ProgramsData",
                  }),
                },
              },
            },
            "429": { ...errorResponse, description: "Rate limit exceeded." },
          },
        },
      },
      "/loan-officers": {
        get: {
          tags: ["Loan Officers"],
          summary: "Public loan-officer directory",
          security: [],
          responses: {
            "200": {
              description: "Public officer fields only.",
              headers: rateLimitHeaders,
              content: {
                "application/json": {
                  schema: okEnvelope({
                    $ref: "#/components/schemas/LoanOfficersData",
                  }),
                },
              },
            },
            "429": { ...errorResponse, description: "Rate limit exceeded." },
          },
        },
      },
      "/leads": {
        post: {
          tags: ["Leads"],
          summary: "Submit a partner lead",
          description:
            "Requires `x-api-key`. If your key has a secret, also send " +
            "`x-signature: sha256=<HMAC-SHA256(secret, rawBody)>`. Idempotent " +
            "on `idempotencyKey`.",
          security: [{ ApiKeyAuth: [] }, { ApiKeyAuth: [], HmacSignature: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LeadInput" },
              },
            },
          },
          responses: {
            "201": {
              description: "Lead captured.",
              headers: rateLimitHeaders,
              content: {
                "application/json": {
                  schema: okEnvelope({
                    $ref: "#/components/schemas/LeadResult",
                  }),
                },
              },
            },
            "400": { ...errorResponse, description: "Invalid body." },
            "401": {
              ...errorResponse,
              description: "Missing/invalid key or HMAC signature.",
            },
            "429": { ...errorResponse, description: "Rate limit exceeded." },
            "503": {
              ...errorResponse,
              description: "Public API not enabled (no keys configured).",
            },
          },
        },
      },
    },
  };
}

// Served as the RAW OpenAPI document (not wrapped in the { ok, data } envelope)
// so standard tooling — Swagger UI, codegen, Postman — can consume it directly.
// CORS + rate-limit + request-id headers are still applied by withPublicApi.
export const GET = withPublicApi(
  () =>
    new Response(JSON.stringify(buildSpec()), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300, s-maxage=3600",
      },
    }),
  { auth: "none", rateLimit: true },
);

export const OPTIONS = preflight;
