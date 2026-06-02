import {
  MessageCircle,
  Zap,
  FileText,
  UserCheck,
  ShieldCheck,
  Clock,
} from "lucide-react";
import { Section, SectionHead } from "@/components/ui/Section";

const FEATURES = [
  {
    icon: MessageCircle,
    title: "Answers in plain English",
    body: "Ask anything about rates, programs, or your situation — 24/7, no jargon, no waiting on hold.",
  },
  {
    icon: Zap,
    title: "One-Day Pre-Approval",
    body: "The assistant gathers what's needed and an underwriter signs off — a verified letter within 24 hours.",
  },
  {
    icon: FileText,
    title: "Smart document concierge",
    body: "MSFG AI tells you exactly what to upload and checks each item as it arrives.",
  },
  {
    icon: UserCheck,
    title: "Human handoff, anytime",
    body: "One tap connects you to a licensed local loan officer — with your full context already in hand.",
  },
  {
    icon: ShieldCheck,
    title: "Transparent by default",
    body: "Every fee disclosed up front. No junk charges, no surprises at the closing table.",
  },
  {
    icon: Clock,
    title: "Close in 21 days",
    body: "Less than half the industry average — because the busywork happens in the background.",
  },
];

export function Features() {
  return (
    <Section id="why">
      <SectionHead
        eyebrow="Why MSFG AI"
        title="A simpler mortgage, because it's a smarter one."
        lead="The assistant removes the friction — and never pretends to be a person. Real experts are always one tap away."
      />
      <div className="grid grid-cols-1 gap-[22px] min-[981px]:grid-cols-3">
        {FEATURES.map((f) => (
          <div
            key={f.title}
            className="rounded-xl border border-line bg-white p-[30px] shadow-card"
          >
            <div className="mb-[18px] flex size-[52px] items-center justify-center rounded-[14px] bg-spring-soft text-green-600">
              <f.icon className="size-6" strokeWidth={1.8} />
            </div>
            <h3 className="mb-2 text-[19px] font-bold tracking-[-0.01em]">
              {f.title}
            </h3>
            <p className="m-0 text-[15.5px] text-muted">{f.body}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}
