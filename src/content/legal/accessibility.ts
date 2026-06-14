import type { TenantConfig } from "@/content/site";
import type { LegalDoc } from "./types";

/** Accessibility Statement for msfg.us. */
export function accessibilityDoc(config: TenantConfig): LegalDoc {
  const { shortName } = config.brand;
  const contactEmail = config.contact.email;
  const contactPhone = config.contact.phoneDisplay;

  return {
    sections: [
      {
        heading: "Our commitment",
        blocks: [
          {
            kind: "p",
            text: `${shortName} is committed to ensuring digital accessibility for people with disabilities. We aim to conform to the Web Content Accessibility Guidelines (WCAG) 2.1 Level AA so that our website is usable by the widest possible audience, regardless of ability or technology.`,
          },
          {
            kind: "p",
            text: `We continually work to improve the accessibility of msfg.us and welcome feedback from users with disabilities.`,
          },
        ],
      },
      {
        heading: "Measures we take",
        blocks: [
          {
            kind: "p",
            text: `To support accessibility, ${shortName} takes the following measures:`,
          },
          {
            kind: "ul",
            items: [
              "Use semantic HTML5 markup so screen readers and assistive technologies can navigate page structure.",
              "Provide visible keyboard focus indicators on all interactive elements.",
              "Maintain sufficient color contrast between foreground text and background colors (WCAG AA minimum 4.5:1 for normal text, 3:1 for large text).",
              "Include meaningful alternative text for all informational images.",
              "Label all form inputs and controls with descriptive text or aria-label attributes.",
              "Use ARIA landmarks and roles where native HTML semantics are insufficient.",
              "Conduct periodic accessibility reviews and address identified issues.",
            ],
          },
        ],
      },
      {
        heading: "Known limitations",
        blocks: [
          {
            kind: "p",
            text: `[PLACEHOLDER — list any known accessibility limitations here once identified through testing. For example: certain third-party embedded widgets, PDF documents, or interactive tools may not yet meet full WCAG 2.1 AA conformance. We are actively working to resolve these issues.]`,
          },
        ],
      },
      {
        heading: "Need help or found a barrier?",
        blocks: [
          {
            kind: "p",
            text: `If you experience difficulty accessing any part of msfg.us, or if you have found an accessibility barrier, please contact us. We will make every effort to provide the information, service, or transaction you are trying to access through an alternative communication method.`,
          },
          {
            kind: "p",
            text: `You can reach us by phone at ${contactPhone} or by email at ${contactEmail}. When contacting us, please describe the accessibility issue and the web address (URL) where you encountered the barrier so we can respond as promptly as possible.`,
          },
        ],
      },
      {
        heading: "Feedback",
        blocks: [
          {
            kind: "p",
            text: `We welcome your feedback on the accessibility of msfg.us. If you encounter an accessibility barrier, please let us know by emailing ${contactEmail} or calling ${contactPhone}. We try to respond to feedback within 5 business days. [PLACEHOLDER — confirm response-time commitment with compliance team.]`,
          },
          {
            kind: "p",
            text: `This accessibility statement was prepared with reference to WCAG 2.1. We assess our site using a combination of self-evaluation and [PLACEHOLDER — external accessibility audit / automated tools, e.g. axe, Lighthouse; list actual tools used once confirmed].`,
          },
        ],
      },
    ],
  };
}
