/** A renderable block inside a legal document section. */
export type LegalBlock =
  | { kind: "p"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "h3"; text: string };

/** A titled section of a legal document. */
export type LegalSection = { heading: string; blocks: LegalBlock[] };

/** A full legal document: an optional intro paragraph + ordered sections. */
export type LegalDoc = { intro?: string; sections: LegalSection[] };
