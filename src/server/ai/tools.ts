/**
 * User-defined tools for MSFG AI, executed SERVER-SIDE inside the chat route's
 * manual agentic loop. Each tool is grounded in the same live data the rest of
 * the site uses (finance math, rate table, program catalog, lead pipeline) so
 * the model never invents figures.
 *
 * Exports:
 *  - TOOLS:   Anthropic.Tool[] schemas passed to the Messages API.
 *  - runTool(name, input): executes one tool call and returns a TEXT string
 *    (what we hand back as the tool_result content). Inputs arrive already
 *    parsed by the SDK — we treat them as objects, never string-match JSON.
 *
 * Tools must never throw: a thrown executor would break the loop. Each catches
 * and returns a short error string the model can recover from.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "node:crypto";
import { monthlyPayment, formatUSD } from "@/lib/finance";
import { RATE_DATA, RATES_PRINCIPAL, type RateTab } from "@/content/rates";
import { CATS, type CategoryKey, type Program } from "@/content/categories";
import { captureLead } from "@/server/leads/leadService";
import type { LeadInput } from "@/validation/lead";

// ---------------------------------------------------------------------------
// Tool schemas
// ---------------------------------------------------------------------------

export const TOOLS: Anthropic.Tool[] = [
  {
    name: "calculate_payment",
    description:
      "Estimate a monthly principal & interest (P&I) mortgage payment. Use for any 'what would my payment be' question for a purchase, a rate/term refinance, or a cash-out. Derives the loan principal from the purpose, then amortizes it. Returns an estimate only — not a commitment to lend.",
    input_schema: {
      type: "object",
      properties: {
        purpose: {
          type: "string",
          enum: ["buy", "refi", "cash"],
          description:
            "buy = purchase, refi = rate/term refinance, cash = cash-out refinance.",
        },
        homePrice: {
          type: "number",
          description: "Purchase price in dollars (buy only).",
        },
        downPaymentPct: {
          type: "number",
          description:
            "Down payment as a percent of price, e.g. 10 for 10% (buy only). Defaults to 20 if omitted.",
        },
        loanBalance: {
          type: "number",
          description:
            "Current loan balance in dollars (refi and cash-out).",
        },
        cashOut: {
          type: "number",
          description: "Additional cash taken out in dollars (cash-out only).",
        },
        homeValue: {
          type: "number",
          description:
            "Estimated home value in dollars (cash-out only) — caps the new loan to avoid exceeding the home's value.",
        },
        annualRatePct: {
          type: "number",
          description:
            "Annual interest rate as a percent, e.g. 6.5 for 6.5%. If unknown, omit and an indicative rate is assumed.",
        },
        termMonths: {
          type: "number",
          description: "Loan term in months. Defaults to 360 (30 years).",
        },
      },
      required: ["purpose"],
    },
  },
  {
    name: "lookup_rates",
    description:
      "Look up MSFG's current indicative mortgage rates. Returns the rate table (product, rate, APR, and an estimated monthly P&I on a $300k loan) for purchase or refinance. Rates are indicative placeholders that depend on credit, property, and a full application — not a commitment to lend.",
    input_schema: {
      type: "object",
      properties: {
        segment: {
          type: "string",
          enum: ["purchase", "refinance"],
          description:
            "Which rate set to show. Omit to return both purchase and refinance.",
        },
      },
      required: [],
    },
  },
  {
    name: "explain_program",
    description:
      "Explain a mortgage loan program (e.g. Conventional, FHA, VA, USDA, Jumbo, ARM, HELOC, cash-out) in plain English, including who it's best for. Informational only; eligibility requires a full application. Provide a program name and/or a category to scope the answer.",
    input_schema: {
      type: "object",
      properties: {
        program: {
          type: "string",
          description:
            "Program name to explain, e.g. 'FHA', 'VA', 'HELOC', 'Conventional', 'cash-out'. Matched loosely.",
        },
        category: {
          type: "string",
          enum: ["buy", "refi", "equity"],
          description:
            "Scope to a category: buy (purchase), refi (refinance), or equity (home equity). Used to list programs when no specific program is named.",
        },
      },
      required: [],
    },
  },
  {
    name: "capture_lead",
    description:
      "Save the user's contact info so a licensed MSFG loan officer can follow up. ONLY call this when the user has agreed to be contacted (consentTcpa true) and has given their name, email, and phone. If consent is missing, do not call this — ask for consent first.",
    input_schema: {
      type: "object",
      properties: {
        firstName: { type: "string", description: "User's first name." },
        lastName: { type: "string", description: "User's last name." },
        email: { type: "string", description: "User's email address." },
        phone: { type: "string", description: "User's phone number." },
        intent: {
          type: "string",
          enum: ["buy", "refi", "cash"],
          description:
            "What they want to do: buy a home, refinance, or take cash out.",
        },
        notes: {
          type: "string",
          description:
            "Short, relevant context for the loan officer (goals, timeline). Never include any fair-lending–prohibited information.",
        },
        consentTcpa: {
          type: "boolean",
          description:
            "True only if the user explicitly agreed MSFG may contact them by phone, text, and email (including automated technology).",
        },
      },
      required: ["firstName", "lastName", "email", "phone", "intent", "consentTcpa"],
    },
  },
];

// ---------------------------------------------------------------------------
// Executor
// ---------------------------------------------------------------------------

/** Coerce an unknown tool input into a record for safe property access. */
function asRecord(input: unknown): Record<string, unknown> {
  return input && typeof input === "object"
    ? (input as Record<string, unknown>)
    : {};
}

/** Read a finite number from a tool input, or undefined. */
function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

/** Read a trimmed non-empty string from a tool input, or undefined. */
function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

const ESTIMATE_CAVEAT =
  "This is an estimate only and not a commitment to lend. Your actual rate and payment depend on your credit, the property, your loan amount, and a complete application.";

/** Default indicative rate (percent) when the user hasn't supplied one. */
const DEFAULT_RATE_PCT = 6.5;

function runCalculatePayment(input: unknown): string {
  const o = asRecord(input);
  const purpose = str(o.purpose) ?? "buy";
  const rate = num(o.annualRatePct) ?? DEFAULT_RATE_PCT;
  const term = num(o.termMonths) ?? 360;
  const rateAssumed = num(o.annualRatePct) === undefined;

  let principal = 0;
  let basis = "";

  if (purpose === "buy") {
    const price = num(o.homePrice);
    if (price === undefined || price <= 0) {
      return "I need the home price to estimate a purchase payment. About how much is the home?";
    }
    const downPct = num(o.downPaymentPct) ?? 20;
    const clampedDown = Math.min(Math.max(downPct, 0), 100);
    principal = price * (1 - clampedDown / 100);
    basis = `a ${formatUSD(price)} home with ${clampedDown}% down → ${formatUSD(
      principal,
    )} loan`;
  } else if (purpose === "refi") {
    const balance = num(o.loanBalance);
    if (balance === undefined || balance <= 0) {
      return "I need your current loan balance to estimate a refinance payment. About how much do you owe?";
    }
    principal = balance;
    basis = `a ${formatUSD(balance)} loan balance`;
  } else if (purpose === "cash") {
    const balance = num(o.loanBalance);
    if (balance === undefined || balance <= 0) {
      return "I need your current loan balance to estimate a cash-out payment. About how much do you owe?";
    }
    const cashOut = Math.max(num(o.cashOut) ?? 0, 0);
    let newLoan = balance + cashOut;
    const homeValue = num(o.homeValue);
    let capped = false;
    if (homeValue !== undefined && homeValue > 0 && newLoan > homeValue) {
      newLoan = homeValue; // bound the new loan to the home's value
      capped = true;
    }
    principal = newLoan;
    basis = `a ${formatUSD(balance)} balance plus ${formatUSD(
      cashOut,
    )} cash out → ${formatUSD(newLoan)} new loan${
      capped ? " (capped at the home's value)" : ""
    }`;
  } else {
    return "Unknown purpose. Use 'buy', 'refi', or 'cash'.";
  }

  const payment = monthlyPayment(principal, rate, term);
  const years = Math.round(term / 12);
  const rateNote = rateAssumed
    ? ` (assuming an indicative ${rate}% rate — share your rate for a closer number)`
    : "";

  return [
    `Estimated monthly principal & interest for ${basis}:`,
    `≈ ${formatUSD(payment)}/mo at ${rate}% over ${years} years${rateNote}.`,
    `This is P&I only and excludes taxes, insurance, HOA, and any mortgage insurance.`,
    ESTIMATE_CAVEAT,
  ].join(" ");
}

function formatRateRows(tab: RateTab): string {
  const rows = RATE_DATA[tab];
  const lines = rows.map((r) => {
    const est = monthlyPayment(RATES_PRINCIPAL, r.rate, r.termMonths);
    return `- ${r.product} (${r.subLabel}): ${r.rate.toFixed(
      3,
    )}% rate, ${r.apr.toFixed(3)}% APR, ${r.points} — est. ${formatUSD(
      est,
    )}/mo on a ${formatUSD(RATES_PRINCIPAL)} loan`;
  });
  const heading = tab === "purchase" ? "Purchase rates" : "Refinance rates";
  return `${heading}:\n${lines.join("\n")}`;
}

function runLookupRates(input: unknown): string {
  const o = asRecord(input);
  const segment = str(o.segment);
  const sections: string[] = [];
  if (segment === "purchase" || segment === undefined) {
    sections.push(formatRateRows("purchase"));
  }
  if (segment === "refinance" || segment === undefined) {
    sections.push(formatRateRows("refinance"));
  }
  return [
    sections.join("\n\n"),
    `These rates are indicative placeholders assuming a strong credit profile and a ${formatUSD(
      RATES_PRINCIPAL,
    )} loan on a single-family primary residence. They are not a commitment to lend; your actual rate depends on your credit, property, loan amount, and a complete application.`,
  ].join("\n\n");
}

/** Map a program to a plain-English explanation block. */
function describeProgram(p: Program): string {
  return `${p.title} — ${p.desc} Best for: ${p.audience}.`;
}

function runExplainProgram(input: unknown): string {
  const o = asRecord(input);
  const program = str(o.program)?.toLowerCase();
  const categoryKey = str(o.category) as CategoryKey | undefined;

  // Flatten the program catalog with its owning category.
  const all: Array<{ cat: CategoryKey; program: Program }> = [];
  (Object.keys(CATS) as CategoryKey[]).forEach((cat) => {
    CATS[cat].opts.forEach((program) => all.push({ cat, program }));
  });

  // 1) Specific program name → best matches across categories.
  if (program) {
    const matches = all.filter(({ program: p }) => {
      const hay = `${p.title} ${p.icon} ${p.desc}`.toLowerCase();
      return hay.includes(program) || program.includes(p.title.toLowerCase());
    });
    if (matches.length > 0) {
      const body = matches
        .map(({ program: p }) => describeProgram(p))
        .join("\n");
      return [
        body,
        "Eligibility and final terms require a complete application, credit review, and property details. This is informational only — not a commitment to lend.",
      ].join("\n\n");
    }
  }

  // 2) Category scope → list that category's programs.
  if (categoryKey && CATS[categoryKey]) {
    const cfg = CATS[categoryKey];
    const body = cfg.opts
      .map((p) => describeProgram(p))
      .join("\n");
    return [
      `${cfg.optsTitle}:`,
      body,
      "Eligibility and final terms require a complete application. Informational only — not a commitment to lend.",
    ].join("\n\n");
  }

  // 3) Fallback → overview across all categories.
  const overview = all
    .map(({ program: p }) => `${p.title}: ${p.desc}`)
    .join("\n");
  return [
    "Here are the main programs MSFG offers:",
    overview,
    "Tell me your goal (buy, refinance, or tap equity) and I can go deeper. Eligibility requires a complete application — informational only, not a commitment to lend.",
  ].join("\n\n");
}

/** Map the tool's intent to the lead pipeline's intent enum input. */
function toLeadIntent(v: unknown): LeadInput["intent"] {
  const s = str(v);
  return s === "refi" || s === "cash" ? s : "buy";
}

async function runCaptureLead(input: unknown): Promise<string> {
  const o = asRecord(input);
  const consent = o.consentTcpa === true;
  if (!consent) {
    return "I can't save your details without your consent. If it's okay for a licensed MSFG loan officer to contact you by phone, text, and email (including automated technology), just say so and I'll pass your info along.";
  }

  const firstName = str(o.firstName);
  const lastName = str(o.lastName);
  const email = str(o.email);
  const phone = str(o.phone);
  if (!firstName || !lastName || !email || !phone) {
    return "To connect you with a loan officer I need your first name, last name, email, and phone. What are they?";
  }

  const notes = str(o.notes);
  const leadInput: LeadInput = {
    intent: toLeadIntent(o.intent),
    contact: { firstName, lastName, email, phone },
    answers: { source: "ai-assistant", ...(notes ? { notes } : {}) },
    consentTcpa: true,
    idempotencyKey: randomUUID(),
    source: "ai-assistant",
  };

  try {
    const { leadId } = await captureLead(leadInput);
    return `Thanks, ${firstName} — I've saved your information (reference ${leadId.slice(
      0,
      8,
    )}). A licensed MSFG loan officer will follow up shortly. Is there anything else I can help with in the meantime?`;
  } catch {
    // Pipeline should not throw, but never break the loop if it does.
    return "I wasn't able to save that just now. You can also reach a licensed loan officer directly — would you like our phone number, or should I try again?";
  }
}

/**
 * Execute one tool call by name. Returns the text we hand back as the
 * tool_result content. Always resolves (never rejects) so the agentic loop
 * keeps running even if a tool hits an unexpected error.
 */
export async function runTool(name: string, input: unknown): Promise<string> {
  try {
    switch (name) {
      case "calculate_payment":
        return runCalculatePayment(input);
      case "lookup_rates":
        return runLookupRates(input);
      case "explain_program":
        return runExplainProgram(input);
      case "capture_lead":
        return await runCaptureLead(input);
      default:
        return `Unknown tool "${name}".`;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return `The ${name} tool hit an error: ${message.slice(
      0,
      200,
    )}. Please offer general guidance or a loan officer instead.`;
  }
}
