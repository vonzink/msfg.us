import type { Metadata } from "next";
import { Mark } from "@/components/ui/Mark";
import { Section, SectionHead } from "@/components/ui/Section";
import { Button } from "@/components/ui/Button";
import { CtaBand } from "@/components/CtaBand";
import { getTenantConfig, getTenantOrigin } from "@/server/tenant/config";
import { SwaggerEmbed } from "./SwaggerEmbed";
import { buildMetadata } from "@/lib/seo/buildMetadata";

export async function generateMetadata(): Promise<Metadata> {
  const config = await getTenantConfig();
  return buildMetadata("/developers", {
    title: "Developers — Public API",
    description: `${config.brand.shortName} public API for partners: versioned, key-authenticated, rate-limited, and OpenAPI-documented. Rates, programs, loan officers, and lead intake.`,
    canonical: "/developers",
  });
}

/** A labeled, accessible code/pre block. */
function Code({ children, label }: { children: string; label?: string }) {
  return (
    <pre
      aria-label={label}
      className="overflow-x-auto rounded-xl border border-line bg-ink p-4 text-[13px] leading-relaxed text-on-dark-2"
    >
      <code>{children}</code>
    </pre>
  );
}

type Endpoint = {
  method: "GET" | "POST";
  path: string;
  auth: string;
  summary: string;
  example: string;
};

function buildEndpoints(base: string): Endpoint[] {
  return [
    {
      method: "GET",
      path: "/rates",
      auth: "Open",
      summary:
        "Today's purchase and refinance rates with estimated monthly P&I on a $300,000 loan.",
      example: `curl ${base}/rates`,
    },
    {
      method: "GET",
      path: "/programs",
      auth: "Open",
      summary: "Loan programs by category (name, blurb, best-for audience).",
      example: `curl ${base}/programs`,
    },
    {
      method: "GET",
      path: "/loan-officers",
      auth: "Open",
      summary:
        "Public loan-officer directory (name, NMLS, city, state, languages, specialties, rating).",
      example: `curl ${base}/loan-officers`,
    },
    {
      method: "POST",
      path: "/leads",
      auth: "API key (+ HMAC)",
      summary:
        "Submit a partner lead. Requires x-api-key; add x-signature when your key has a secret.",
      example: `curl -X POST ${base}/leads \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: YOUR_KEY" \\
  -d '{
    "intent": "buy",
    "contact": {
      "firstName": "Jane", "lastName": "Doe",
      "email": "jane@example.com", "phone": "303-555-0142"
    },
    "consentTcpa": true,
    "idempotencyKey": "a-unique-string-16chars+"
  }'`,
    },
  ];
}

const HMAC_EXAMPLE = `# Node: sign the exact raw JSON body you send
const crypto = require("crypto");
const body = JSON.stringify({ intent: "buy", /* … */ });
const sig = crypto.createHmac("sha256", YOUR_SECRET)
  .update(body, "utf8").digest("hex");
// send header:  x-signature: sha256=<sig>`;

export default async function DevelopersPage() {
  const config = await getTenantConfig();
  const origin = await getTenantOrigin();
  const BASE = `${origin}/api/v1/public`;
  const OPENAPI_URL = `${BASE}/openapi.json`;
  const ENDPOINTS = buildEndpoints(BASE);
  return (
    <>
      {/* Mini-hero — dark emerald, matches /rates */}
      <section className="hero-bg px-0 pb-[60px] pt-14 text-center text-white">
        <div className="wrap">
          <span className="mb-3.5 inline-flex items-center gap-2.5 text-mint">
            <Mark size={18} label={config.brand.shortName} />
            <span className="text-[13px] font-semibold tracking-[0.02em]">
              Developers
            </span>
          </span>
          <h1 className="m-0 text-[clamp(34px,4.6vw,54px)] font-extrabold tracking-[-0.035em]">
            The {config.brand.shortName} <span className="text-mint">public API</span>
          </h1>
          <p className="mx-auto mt-4 max-w-[58ch] text-[18px] text-on-dark-2">
            A versioned, key-authenticated, rate-limited API for partners.
            Pull live rates, loan programs, and loan officers — and submit
            leads straight into our pipeline.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Button href={OPENAPI_URL} variant="green">
              OpenAPI spec
            </Button>
            <Button href="#explorer" variant="ghostDark">
              Try it live
            </Button>
          </div>
        </div>
      </section>

      {/* Getting started: base URL, auth, rate limits */}
      <Section>
        <SectionHead
          eyebrow="Getting started"
          title="Base URL, auth, and limits"
          lead="All public endpoints live under one versioned base. Reads are open; writes use an API key."
        />
        <div className="grid gap-8 md:grid-cols-3">
          <div>
            <h3 className="text-[17px] font-bold text-ink">Base URL</h3>
            <p className="mt-2 text-[15px] text-muted">
              Every endpoint is relative to:
            </p>
            <Code label="API base URL">{BASE}</Code>
          </div>
          <div>
            <h3 className="text-[17px] font-bold text-ink">Authentication</h3>
            <p className="mt-2 text-[15px] text-muted">
              Send your key in the{" "}
              <code className="rounded bg-paper-2 px-1.5 py-0.5 text-[13px]">
                x-api-key
              </code>{" "}
              header on write endpoints. If your key was issued with a secret,
              also sign the raw body and send{" "}
              <code className="rounded bg-paper-2 px-1.5 py-0.5 text-[13px]">
                x-signature: sha256=&lt;hex&gt;
              </code>
              .
            </p>
            <Code label="HMAC signing example">{HMAC_EXAMPLE}</Code>
          </div>
          <div>
            <h3 className="text-[17px] font-bold text-ink">Rate limits</h3>
            <p className="mt-2 text-[15px] text-muted">
              Requests are limited per key (or client IP). Every response
              includes:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-[14.5px] text-muted">
              <li>
                <code className="text-[13px]">X-RateLimit-Limit</code>
              </li>
              <li>
                <code className="text-[13px]">X-RateLimit-Remaining</code>
              </li>
              <li>
                <code className="text-[13px]">X-RateLimit-Reset</code>
              </li>
            </ul>
            <p className="mt-2 text-[14.5px] text-muted">
              A <code className="text-[13px]">429</code> response adds{" "}
              <code className="text-[13px]">Retry-After</code> (seconds).
            </p>
          </div>
        </div>

        <div className="mt-10 rounded-2xl border border-line bg-paper-2 p-6">
          <h3 className="text-[16px] font-bold text-ink">Response envelope</h3>
          <p className="mt-2 max-w-[70ch] text-[15px] text-muted">
            Endpoints return a consistent JSON envelope. Success is{" "}
            <code className="text-[13px]">
              {"{ ok: true, data: … }"}
            </code>{" "}
            and failure is{" "}
            <code className="text-[13px]">
              {'{ ok: false, error: "…" }'}
            </code>
            . A request id is echoed back in{" "}
            <code className="text-[13px]">X-Request-Id</code>.
          </p>
        </div>
      </Section>

      {/* Endpoints */}
      <Section alt>
        <SectionHead
          eyebrow="Reference"
          title="Endpoints"
          lead="Four endpoints today. The full machine-readable contract is in the OpenAPI document."
        />
        <ul className="grid gap-6">
          {ENDPOINTS.map((ep) => (
            <li
              key={`${ep.method} ${ep.path}`}
              className="rounded-2xl border border-line bg-paper p-6"
            >
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className={
                    "rounded-md px-2.5 py-1 text-[12px] font-bold tracking-wide " +
                    (ep.method === "GET"
                      ? "bg-spring/20 text-spring-3"
                      : "bg-ink text-white")
                  }
                >
                  {ep.method}
                </span>
                <code className="text-[15px] font-semibold text-ink">
                  {ep.path}
                </code>
                <span className="ml-auto text-[12.5px] font-semibold text-muted">
                  {ep.auth}
                </span>
              </div>
              <p className="mt-3 text-[15px] text-muted">{ep.summary}</p>
              <div className="mt-3">
                <Code label={`Example request for ${ep.method} ${ep.path}`}>
                  {ep.example}
                </Code>
              </div>
            </li>
          ))}
        </ul>

        <p className="mt-8 text-[15px] text-muted">
          Full schema:{" "}
          <a
            href={OPENAPI_URL}
            className="font-semibold text-spring-3 underline"
          >
            {OPENAPI_URL}
          </a>
        </p>
      </Section>

      {/* Live explorer (progressive — Swagger UI via CDN) */}
      <Section>
        <SectionHead
          eyebrow="Explore"
          title="Interactive API explorer"
          lead="Powered by the OpenAPI document below. Loads on demand from a CDN — if it's blocked, every endpoint is still documented above."
        />
        <div id="explorer" className="scroll-mt-24">
          <SwaggerEmbed specUrl={OPENAPI_URL} />
        </div>
      </Section>

      <CtaBand />
    </>
  );
}
