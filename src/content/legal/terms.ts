import type { TenantConfig } from "@/content/site";
import type { LegalDoc } from "./types";

/** Terms of Use for the msfg.us marketing site. */
export function termsDoc(config: TenantConfig): LegalDoc {
  const { legalName, shortName } = config.brand;
  const address = config.legal.address ?? "[PLACEHOLDER] — registered office address";
  const privacyContact = config.legal.privacyEmail ?? config.contact.email;

  return {
    sections: [
      {
        heading: "Acceptance of terms",
        blocks: [
          {
            kind: "p",
            text: `By accessing or using msfg.us (the "Site"), you agree to be bound by these Terms of Use ("Terms"). If you do not agree to these Terms, please do not use the Site. These Terms constitute a legally binding agreement between you and ${legalName} ("${shortName}", "we", "our", or "us"). We may update these Terms at any time; your continued use of the Site after changes are posted constitutes your acceptance of the revised Terms.`,
          },
        ],
      },
      {
        heading: "Permitted use",
        blocks: [
          {
            kind: "p",
            text: `You may use the Site only for lawful, personal, non-commercial purposes in connection with exploring mortgage products and services offered by ${shortName}. You agree not to:`,
          },
          {
            kind: "ul",
            items: [
              "Use any automated system, bot, spider, or scraper to access or extract data from the Site without our express written permission.",
              "Attempt to probe, scan, or test the vulnerability of the Site or any related system or network.",
              "Interfere with or disrupt the integrity or performance of the Site or its servers.",
              "Use the Site in any manner that could damage, disable, overburden, or impair our infrastructure.",
              "Collect or harvest any personally identifiable information from the Site.",
              "Use the Site for any unlawful purpose or in violation of any applicable law or regulation.",
            ],
          },
        ],
      },
      {
        heading: "Not financial advice / no commitment to lend",
        blocks: [
          {
            kind: "p",
            text: `All content on the Site — including rate estimates, payment calculations, program descriptions, and any output from ${shortName}'s AI assistant — is provided for general informational and illustrative purposes only. Nothing on the Site constitutes financial, legal, or tax advice, a pre-approval, a pre-qualification, or a commitment to lend.`,
          },
          {
            kind: "p",
            text: `Any rate or payment estimate displayed on the Site is an illustration only. Actual loan terms, rates, and eligibility are determined only after submission of a complete mortgage application, a review of your credit history, verification of income and assets, an independent property appraisal, and full underwriting. Rates and program availability are subject to change without notice and vary based on your individual circumstances.`,
          },
        ],
      },
      {
        heading: "Intellectual property",
        blocks: [
          {
            kind: "p",
            text: `All content, features, and functionality on the Site — including text, graphics, logos, icons, images, audio clips, and software — are the exclusive property of ${legalName} or its licensors and are protected by applicable copyright, trademark, and other intellectual property laws. You may not reproduce, distribute, modify, create derivative works of, publicly display, publicly perform, republish, download, store, or transmit any material from the Site without our prior written consent, except that you may print or download one copy of a reasonable number of pages for your own personal, non-commercial reference.`,
          },
        ],
      },
      {
        heading: "Third-party links",
        blocks: [
          {
            kind: "p",
            text: `The Site may contain links to third-party websites or services, including the NMLS Consumer Access registry, our loan origination system, and other resources. These links are provided for your convenience only. We have no control over the content, privacy practices, or availability of third-party sites and accept no responsibility for them. Accessing any third-party site is at your own risk and subject to that site's own terms and privacy policy.`,
          },
        ],
      },
      {
        heading: "Disclaimers",
        blocks: [
          {
            kind: "p",
            text: `THE SITE AND ALL CONTENT AND SERVICES PROVIDED THROUGH IT ARE OFFERED ON AN "AS IS" AND "AS AVAILABLE" BASIS WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED. TO THE FULLEST EXTENT PERMITTED BY APPLICABLE LAW, ${shortName.toUpperCase()} DISCLAIMS ALL WARRANTIES, INCLUDING WITHOUT LIMITATION ANY IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SITE WILL BE UNINTERRUPTED, ERROR-FREE, OR FREE OF VIRUSES OR OTHER HARMFUL COMPONENTS, OR THAT ANY DEFECTS WILL BE CORRECTED.`,
          },
        ],
      },
      {
        heading: "Limitation of liability",
        blocks: [
          {
            kind: "p",
            text: `TO THE FULLEST EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL ${shortName.toUpperCase()}, ITS AFFILIATES, OFFICERS, DIRECTORS, EMPLOYEES, AGENTS, OR LICENSORS BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES — INCLUDING WITHOUT LIMITATION LOSS OF PROFITS, DATA, OR GOODWILL — ARISING OUT OF OR RELATED TO YOUR USE OF OR INABILITY TO USE THE SITE, EVEN IF WE HAVE BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES. [PLACEHOLDER — confirm liability caps with counsel before launch.]`,
          },
        ],
      },
      {
        heading: "Indemnification",
        blocks: [
          {
            kind: "p",
            text: `You agree to indemnify, defend, and hold harmless ${legalName} and its affiliates, officers, directors, employees, and agents from and against any claims, liabilities, damages, losses, costs, and expenses (including reasonable attorneys' fees) arising out of or related to: (a) your use of the Site in violation of these Terms; (b) your violation of any applicable law or regulation; or (c) your infringement of any third-party right.`,
          },
        ],
      },
      {
        heading: "Governing law & dispute resolution",
        blocks: [
          {
            kind: "p",
            text: `These Terms shall be governed by and construed in accordance with the laws of the State of [PLACEHOLDER — governing-law state; confirm with counsel], without regard to its conflict-of-law provisions.`,
          },
          {
            kind: "p",
            text: `[PLACEHOLDER — arbitration clause and class-action waiver: confirm with counsel before including. If arbitration is used, include required consumer disclosures and opt-out procedures per applicable law.]`,
          },
        ],
      },
      {
        heading: "Changes to these terms",
        blocks: [
          {
            kind: "p",
            text: `We reserve the right to modify these Terms at any time at our sole discretion. We will indicate the date of the most recent update at the top of this page. Your continued use of the Site after any changes constitutes your acceptance of the revised Terms. We encourage you to review these Terms periodically.`,
          },
        ],
      },
      {
        heading: "Contact",
        blocks: [
          {
            kind: "p",
            text: `If you have questions about these Terms, please contact us at: ${legalName}, ${address}. Email: ${privacyContact}.`,
          },
        ],
      },
    ],
  };
}
