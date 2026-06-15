import type { TenantConfig } from "@/content/site";
import type { LegalDoc } from "./types";

/**
 * Verbatim Texas SML consumer notice (Tex. Fin. Code Ch. 156 / 7 TAC §80.200).
 * This is statutory text required for Texas-licensed mortgage companies — do NOT
 * paraphrase. Sourced from the company's live notice. Exported as a single string
 * for `config.legal.texasNotice` (footer/licensing) and rendered as a standalone
 * page via `texasNoticeDoc`.
 */
export const TEXAS_CONSUMER_NOTICE =
  "Consumers wishing to file a complaint against a mortgage company or residential mortgage loan originator licensed in Texas should send a completed complaint form to the Texas Department of Savings and Mortgage Lending (SML), 2601 North Lamar Boulevard, Suite 201, Austin, Texas 78705. Telephone: 1-877-276-5550. Information and complaint forms are available on the Department's website at www.sml.texas.gov. The Department maintains a recovery fund to make payments of certain actual out-of-pocket damages sustained by borrowers caused by acts of licensed mortgage companies or residential mortgage loan originators. A written application for reimbursement from the recovery fund must be filed with and investigated by the Department prior to the payment of a claim. Additional information about the recovery fund is available at www.sml.texas.gov.";

/** The Texas Consumer Notice as a renderable legal document (broken into
 *  readable paragraphs; substance is verbatim). */
export function texasNoticeDoc(config: TenantConfig): LegalDoc {
  return {
    intro: `${config.brand.legalName} (NMLS #${config.contact.nmls}) is licensed in Texas by the Department of Savings and Mortgage Lending. The following notice is provided to Texas consumers.`,
    sections: [
      {
        heading: "Consumer complaint notice — Texas residents",
        blocks: [
          {
            kind: "p",
            text: "Consumers wishing to file a complaint against a mortgage company or residential mortgage loan originator licensed in Texas should send a completed complaint form to the Texas Department of Savings and Mortgage Lending (SML):",
          },
          {
            kind: "p",
            text: "Texas Department of Savings and Mortgage Lending, 2601 North Lamar Boulevard, Suite 201, Austin, Texas 78705. Telephone: 1-877-276-5550.",
          },
          {
            kind: "p",
            text: "Information and complaint forms are available on the Department's website at www.sml.texas.gov.",
          },
        ],
      },
      {
        heading: "Recovery fund",
        blocks: [
          {
            kind: "p",
            text: "The Department maintains a recovery fund to make payments of certain actual out-of-pocket damages sustained by borrowers caused by acts of licensed mortgage companies or residential mortgage loan originators. A written application for reimbursement from the recovery fund must be filed with and investigated by the Department prior to the payment of a claim. Additional information about the recovery fund is available at www.sml.texas.gov.",
          },
          {
            kind: "link",
            text: "Texas Department of Savings and Mortgage Lending ↗",
            href: "https://www.sml.texas.gov",
            external: true,
          },
        ],
      },
    ],
  };
}
