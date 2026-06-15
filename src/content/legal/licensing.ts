import type { TenantConfig } from "@/content/site";
import type { LegalDoc } from "./types";

export function licensingDoc(config: TenantConfig): LegalDoc {
  const { brand, contact, legal } = config;
  return {
    sections: [
      {
        heading: "Who we are",
        blocks: [
          {
            kind: "p",
            text: `${brand.legalName}, NMLS #${contact.nmls} [PLACEHOLDER]. ${legal.address ?? "[PLACEHOLDER] — registered office address"}.`,
          },
        ],
      },
      {
        heading: "Where we're licensed",
        blocks: [
          {
            kind: "p",
            text: `${brand.shortName} is licensed to originate residential mortgage loans in the following states. The per-state table below lists each state and the applicable license name or number. [PLACEHOLDER — verify and replace each license number before launch.]`,
          },
        ],
      },
      {
        heading: "Equal Housing Lender",
        blocks: [
          {
            kind: "p",
            text: `${brand.shortName} is an Equal Housing Lender. We do business in accordance with the Fair Housing Act and the Equal Credit Opportunity Act. We do not discriminate on the basis of race, color, national origin, religion, sex, familial status, disability, age, or any other characteristic protected by applicable law.`,
          },
        ],
      },
      {
        heading: "Key disclosures",
        blocks: [
          {
            kind: "ul",
            items: [
              "All loans are subject to credit and property approval.",
              "Rates, programs, loan amounts, and terms are subject to change without notice.",
              "A rate quote is not a commitment to lend.",
              "This is not an offer to lend or a commitment to make a loan at any specific rate or on any specific terms.",
              `${brand.assistantName} provides general information and estimates only; it is not a substitute for advice from a licensed loan officer and does not constitute a commitment to lend.`,
            ],
          },
        ],
      },
      {
        heading: "Texas notice",
        blocks: [
          {
            kind: "p",
            text: legal.texasNotice,
          },
        ],
      },
      {
        heading: "Verify our license",
        blocks: [
          {
            kind: "p",
            text: `You can verify ${brand.shortName}'s license and look up individual loan originators on NMLS Consumer Access, the free, official database maintained by the Nationwide Multistate Licensing System. Visit our NMLS Consumer Access page at /nmls-consumer-access for a direct link to the official registry or search ${contact.nmlsConsumerAccessUrl} directly.`,
          },
        ],
      },
    ],
  };
}
