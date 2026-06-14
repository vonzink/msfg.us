import {
  Building,
  Building2,
  Castle,
  DoorOpen,
  FileSignature,
  Handshake,
  HelpCircle,
  Home,
  Inbox,
  LineChart,
  Mailbox,
  Palmtree,
  Search,
  Warehouse,
} from "lucide-react";
import type { StepIconKey } from "@/content/flows";

/**
 * Calendar tile with a short centered label (e.g. "0–3", "6+", "15", "$").
 * Mirrors the prototype's `I.cal(text)` glyph, which embeds text in the SVG.
 */
function CalBadge({ text }: { text: string }) {
  // Shrink the type a touch for wider labels so it never clips the frame.
  const fontSize = text.length >= 3 ? 6.5 : 8;
  return (
    <svg
      width={24}
      height={24}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="4" width="18" height="18" rx="3" />
      <path d="M3 9h18M8 2v4M16 2v4" />
      <text
        x="12"
        y="18"
        fontSize={fontSize}
        fontFamily="var(--font-hanken), sans-serif"
        fontWeight={700}
        textAnchor="middle"
        fill="currentColor"
        stroke="none"
      >
        {text}
      </text>
    </svg>
  );
}

/**
 * Resolve a choice option's icon key (+ optional calendar badge text) to a
 * concrete glyph. Lucide equivalents chosen to match the prototype's intent:
 * mailbox→Mailbox, palm→Palmtree, invest→LineChart, house→Home, condo→Building2,
 * coop→Castle, manuf→Warehouse, help→HelpCircle. `cal` renders the badge tile.
 */
export function StepIcon({
  icon,
  badge,
}: {
  icon: StepIconKey;
  badge?: string;
}) {
  switch (icon) {
    case "cal":
      return <CalBadge text={badge ?? ""} />;
    case "help":
      return <HelpCircle className="size-6" strokeWidth={1.8} />;
    case "mailbox":
      // Prototype uses a mailbox-style glyph for "Primary residence".
      return <Mailbox className="size-6" strokeWidth={1.8} />;
    case "palm":
      return <Palmtree className="size-6" strokeWidth={1.8} />;
    case "invest":
      return <LineChart className="size-6" strokeWidth={1.8} />;
    case "house":
      return <Home className="size-6" strokeWidth={1.8} />;
    case "condo":
      return <Building2 className="size-6" strokeWidth={1.8} />;
    case "coop":
      return <Castle className="size-6" strokeWidth={1.8} />;
    case "manuf":
      return <Warehouse className="size-6" strokeWidth={1.8} />;
    case "doc":
      return <FileSignature className="size-6" strokeWidth={1.8} />;
    case "offer":
      return <Handshake className="size-6" strokeWidth={1.8} />;
    case "dooropen":
      return <DoorOpen className="size-6" strokeWidth={1.8} />;
    case "search":
      return <Search className="size-6" strokeWidth={1.8} />;
    case "units":
      return <Building className="size-6" strokeWidth={1.8} />;
    default:
      // Exhaustive fallback; keeps the union honest.
      return <Inbox className="size-6" strokeWidth={1.8} />;
  }
}
