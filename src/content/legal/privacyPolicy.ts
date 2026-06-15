import type { TenantConfig } from "@/content/site";
import type { LegalDoc } from "./types";

/** Privacy Policy for the msfg.us marketing site. */
export function privacyPolicyDoc(config: TenantConfig): LegalDoc {
  const privacyContact = config.legal.privacyEmail ?? config.contact.email;
  const address = config.legal.address ?? "[PLACEHOLDER] — registered office address";

  return {
    intro:
      `This Privacy Policy describes how ${config.brand.legalName} ("${config.brand.shortName}", "we", "our", or "us") collects, uses, and shares information when you visit msfg.us (the "Site"). This policy covers the public marketing site only; the loan application portal and loan origination system (LOS) have their own notices provided at the time of application.`,
    sections: [
      {
        heading: "Information we collect",
        blocks: [
          {
            kind: "p",
            text: "We collect information you submit directly, information collected automatically, and information from cookies and local storage.",
          },
          {
            kind: "ul",
            items: [
              "Details you submit: your name, email address, phone number, and the property and financing details you enter in the application funnel (e.g., purchase price, loan type, estimated credit range).",
              "Automatic data: device type, browser, operating system, IP address, referring URL, and pages you view on the Site collected via analytics tools.",
              "Cookies and local storage: session cookies, preference tokens, and analytics identifiers. See the Cookies & Analytics section below.",
            ],
          },
        ],
      },
      {
        heading: "How we use information",
        blocks: [
          {
            kind: "ul",
            items: [
              "Respond to your inquiries and connect you with a licensed loan officer.",
              "Route your information to a licensed loan officer who can assist with your mortgage needs.",
              "Pre-fill or transfer an application to our loan origination system (app.msfgco.com) when you choose to proceed.",
              "Analyze Site traffic and usage to improve the Site experience.",
              "Comply with applicable law and regulatory requirements.",
            ],
          },
        ],
      },
      {
        heading: "How information is shared",
        blocks: [
          {
            kind: "ul",
            items: [
              `With licensed loan officers and our loan origination system (app.msfgco.com) to process your mortgage inquiry or application.`,
              "With service providers acting on our behalf, such as our CRM platform [PLACEHOLDER — confirm vendor name], address-autocomplete service [PLACEHOLDER — confirm vendor name], and cloud hosting provider — each bound by confidentiality obligations.",
              "As required by law, court order, or regulatory authority.",
              "In connection with a merger, acquisition, or sale of all or a portion of our assets, in which case your information may be transferred as a business asset.",
              "We do not sell personal information to third parties [PLACEHOLDER — confirm and align with applicable state law definitions of 'sale' before launch].",
            ],
          },
        ],
      },
      {
        heading: "Cookies & analytics",
        blocks: [
          {
            kind: "p",
            text: `We use cookies, local storage, and third-party analytics tools [PLACEHOLDER — list specific tools, e.g., Google Analytics, before launch] to understand how visitors use the Site, remember preferences, and improve performance. You can control or disable cookies through your browser settings; disabling cookies may affect certain Site features. We do not currently respond to browser "Do Not Track" signals.`,
          },
        ],
      },
      {
        heading: "Your privacy rights",
        blocks: [
          {
            kind: "p",
            text: "Depending on where you live, you may have rights under applicable state privacy law, including:",
          },
          {
            kind: "ul",
            items: [
              "California residents (CCPA/CPRA): the right to know what personal information we collect, to request deletion, to correct inaccurate information, and to opt out of the sale or sharing of personal information [PLACEHOLDER — confirm applicable CPRA obligations before launch].",
              "Residents of other states with comprehensive privacy laws [PLACEHOLDER — confirm applicable states and rights before launch] may have similar rights of access, deletion, and correction.",
              `To exercise any of these rights, please contact us at ${privacyContact}. We will respond within the timeframe required by applicable law and may need to verify your identity before processing your request.`,
            ],
          },
        ],
      },
      {
        heading: "Data retention & security",
        blocks: [
          {
            kind: "p",
            text: `We retain personal information for as long as necessary to provide our services, comply with legal obligations, resolve disputes, and enforce our agreements [PLACEHOLDER — define specific retention periods by data category before launch]. We use reasonable administrative, technical, and physical safeguards to protect your information, but no method of transmission over the Internet is 100% secure.`,
          },
        ],
      },
      {
        heading: "Children",
        blocks: [
          {
            kind: "p",
            text: "The Site is not directed to children under the age of 13 (or 16 where required by applicable law), and we do not knowingly collect personal information from children. If you believe a child has provided us personal information, please contact us and we will delete it.",
          },
        ],
      },
      {
        heading: "Changes to this policy",
        blocks: [
          {
            kind: "p",
            text: 'We may update this Privacy Policy from time to time. The "Last updated" date shown at the top of this page reflects the most recent revision. Continued use of the Site after changes are posted constitutes your acceptance of the updated policy.',
          },
        ],
      },
      {
        heading: "Contact us",
        blocks: [
          {
            kind: "p",
            text: `${config.brand.legalName}. NMLS #${config.contact.nmls} [PLACEHOLDER]. ${address}. Privacy contact: ${privacyContact}.`,
          },
        ],
      },
    ],
  };
}
