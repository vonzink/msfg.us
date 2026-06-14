/**
 * Quick-prompt pill labels for the homepage AI widget. (The live assistant is
 * the Mortgage Brain, proxied via /api/v1/ai/ask, which renders source-grounded
 * answers verbatim; these are just the suggestion chips. The assistant never
 * pretends to be a person and always offers a human handoff.)
 */

export type AiReply = { lead: string; bullets?: string[]; tail?: string };
export type AiScriptEntry = { user: string; reply: AiReply };

export const AI_SCRIPT: Record<string, AiScriptEntry> = {
  "Start my pre-approval": {
    user: "I'm looking to start my pre-approval — how does it work?",
    reply: {
      lead: "Starting a pre-approval with MSFG is simple and fast. Here's the gist:",
      bullets: [
        "Begin right here — a few questions about you, your income, and the home you're after.",
        "No credit pull happens here — a licensed loan officer reviews credit later, only when you're ready.",
        "You get a pre-approval letter that shows sellers and agents you're serious.",
        "We tailor real loan options and rates to your profile.",
      ],
      tail: "Want to begin now? I'll just need your name to get started — or I can connect you with a local loan officer. 🏡",
    },
  },
  "Lower my rate": {
    user: "Can I lower my current rate?",
    reply: {
      lead: "Possibly! If rates have dropped since you closed — or your credit has improved — a refinance could lower your monthly payment. Tell me your current balance and rate and I'll estimate your break-even in seconds.",
    },
  },
  "Start saving": {
    user: "How can a refinance help me save?",
    reply: {
      lead: "A rate-and-term refinance can cut your monthly payment; a cash-out lets you tap equity for renovations or debt payoff. Want me to run both side by side for your home?",
    },
  },
  "Get cash": {
    user: "I'd like to get cash from my home.",
    reply: {
      lead: "You can tap your equity through a HELOC or a cash-out refinance. I'll compare the two for your situation — what's your home worth and what do you still owe?",
    },
  },
};

export const DEFAULT_REPLY: AiReply = {
  lead: "Great question — let me pull that together. In the live site I'll answer using your real numbers, then hand you to a licensed MSFG loan officer whenever you'd like.",
};

/** Quick-prompt pill order shown under the AI input. */
export const AI_PILLS = [
  "Start my pre-approval",
  "Lower my rate",
  "Start saving",
  "Get cash",
] as const;
