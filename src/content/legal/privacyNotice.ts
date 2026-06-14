import type { TenantConfig } from "@/content/site";
import type { GlbaShareRow } from "@/components/legal/GlbaFactsTable";
import type { LegalDoc } from "./types";

/** Standard GLBA sharing-matrix rows for a residential mortgage company.
 *  Values marked [PLACEHOLDER] must be confirmed by counsel before launch. */
export function glbaRows(config: TenantConfig): GlbaShareRow[] {
  const shortName = config.brand.shortName;
  return [
    {
      reason: `For our everyday business purposes — such as to process your transactions, maintain your account(s), respond to court orders and legal investigations, or report to credit bureaus.`,
      shares: "Yes",
      canLimit: "No",
    },
    {
      reason: `For our marketing purposes — to offer our products and services to you. [PLACEHOLDER — confirm whether ${shortName} conducts this sharing]`,
      shares: "No",
      canLimit: "We don't share",
    },
    {
      reason: `For joint marketing with other financial companies. [PLACEHOLDER — confirm joint-marketing arrangements]`,
      shares: "No",
      canLimit: "We don't share",
    },
    {
      reason: `For our affiliates' everyday business purposes — information about your transactions and experiences. [PLACEHOLDER — confirm affiliate sharing]`,
      shares: "No",
      canLimit: "We don't share",
    },
    {
      reason: `For our affiliates' everyday business purposes — information about your creditworthiness. [PLACEHOLDER — confirm affiliate sharing]`,
      shares: "No",
      canLimit: "We don't share",
    },
    {
      reason: `For nonaffiliates to market to you. [PLACEHOLDER — confirm nonaffiliate sharing]`,
      shares: "No",
      canLimit: "We don't share",
    },
  ];
}

/** GLBA model-form Privacy Notice for the msfg.us marketing site. */
export function privacyNoticeDoc(config: TenantConfig): LegalDoc {
  const { legalName, shortName } = config.brand;
  const { nmls } = config.contact;
  const privacyContact = config.legal.privacyEmail ?? config.contact.email;

  return {
    intro: `FACTS — What does ${legalName} do with your personal information?`,
    sections: [
      {
        heading: "Why?",
        blocks: [
          {
            kind: "p",
            text: `Financial companies choose how they share your personal information. Federal law gives consumers the right to limit some but not all sharing. Federal law also requires us to tell you how we collect, share, and protect your personal information. Please read this notice carefully to understand what we do.`,
          },
        ],
      },
      {
        heading: "What?",
        blocks: [
          {
            kind: "p",
            text: "The types of personal information we collect and share depend on the product or service you have with us. This information can include:",
          },
          {
            kind: "ul",
            items: [
              "Social Security number and income",
              "Account balances and payment history",
              "Credit history and credit scores",
            ],
          },
        ],
      },
      {
        heading: "How?",
        blocks: [
          {
            kind: "p",
            text: `All financial companies need to share customers' personal information to run their everyday business. In the section below, we list the reasons financial companies can share their customers' personal information; the reasons ${shortName} chooses to share; and whether you can limit this sharing.`,
          },
        ],
      },
      {
        heading: "Sharing at a glance",
        blocks: [
          {
            kind: "h3",
            text: "Reasons we can share your personal information",
          },
          {
            kind: "p",
            text: "(See the sharing table rendered below for the full matrix of sharing reasons and whether you can limit them.)",
          },
        ],
      },
      {
        heading: "Who we are",
        blocks: [
          {
            kind: "p",
            text: `Who is providing this notice: ${legalName}, NMLS #${nmls} [PLACEHOLDER].`,
          },
        ],
      },
      {
        heading: "What we do",
        blocks: [
          {
            kind: "h3",
            text: `How does ${shortName} protect my personal information?`,
          },
          {
            kind: "p",
            text: `To protect your personal information from unauthorized access and use, we use security measures that comply with federal law. These measures include computer safeguards and secured files and buildings. [PLACEHOLDER — describe specific safeguards before launch.]`,
          },
          {
            kind: "h3",
            text: `How does ${shortName} collect my personal information?`,
          },
          {
            kind: "p",
            text: "We collect your personal information, for example, when you apply for a mortgage loan; give us your income information; provide employment information; give us your contact information; or connect with us online.",
          },
          {
            kind: "h3",
            text: "Why can't I limit all sharing?",
          },
          {
            kind: "p",
            text: "Federal law gives you the right to limit only: sharing for affiliates' everyday business purposes — information about your creditworthiness; affiliates from using your information to market to you; sharing for nonaffiliates to market to you. State laws and individual companies may give you additional rights to limit sharing. See below for more on your rights under state law.",
          },
        ],
      },
      {
        heading: "Definitions",
        blocks: [
          {
            kind: "ul",
            items: [
              `Affiliates: companies related by common ownership or control. They can be financial and nonfinancial companies. [PLACEHOLDER — list ${shortName} affiliates or confirm "none" before launch.]`,
              `Nonaffiliates: companies not related by common ownership or control. They can be financial and nonfinancial companies. [PLACEHOLDER — list nonaffiliate sharing partners or confirm "none" before launch.]`,
              `Joint marketing: a formal agreement between nonaffiliated financial companies that together market financial products or services to you. [PLACEHOLDER — confirm joint-marketing arrangements before launch.]`,
            ],
          },
        ],
      },
      {
        heading: "Questions?",
        blocks: [
          {
            kind: "p",
            text: `Call us at ${config.contact.phoneDisplay} or email us at ${privacyContact}. You may also write to us at: ${legalName}, ${config.legal.address ?? "[PLACEHOLDER] — registered office address"}.`,
          },
        ],
      },
    ],
  };
}
