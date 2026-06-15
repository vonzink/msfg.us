import type { Intent } from "@/content/flows";

/** Suggested opening questions per apply flow, shown as tappable chips on the
 *  empty apply-chat panel. Intent-aware; never references the applicant's own
 *  entered answers. */
export const APPLY_CHAT_STARTERS: Record<Intent, string[]> = {
  buy: [
    "How much home can I afford?",
    "What credit score do I need to buy?",
    "How much down payment do I need?",
    "FHA vs. conventional — what's the difference?",
  ],
  refi: [
    "Should I refinance right now?",
    "How much could refinancing save me?",
    "What is a VA IRRRL?",
    "Will applying affect my credit?",
  ],
  cash: [
    "How does a cash-out refinance work?",
    "HELOC vs. cash-out — which fits me?",
    "How much equity can I access?",
    "What can I use the cash for?",
  ],
};

/** Help prompt for the applicant's CURRENT step. Sends only the step's QUESTION
 *  text — never the applicant's answer. */
export function stepHelpPrompt(stepQuestion: string): string {
  return `On a mortgage application, what does this question mean and how should I answer it: "${stepQuestion}"?`;
}
