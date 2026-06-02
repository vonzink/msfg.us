import { Button } from "@/components/ui/Button";
import { ScheduleCallButton } from "@/components/integrations/ScheduleCallButton";

/** Dark emerald CTA band with a radial glow. Reused on every marketing page. */
export function CtaBand({
  title = "Ready when you are.",
  lead = "Ask a question, run a number, or start your application — all in one conversation.",
  primaryHref = "/apply/buy",
  primaryLabel = "Start with MSFG AI",
  secondaryHref = "/buy",
  secondaryLabel = "Talk to a loan officer",
}: {
  title?: string;
  lead?: string;
  primaryHref?: string;
  primaryLabel?: string;
  secondaryHref?: string;
  secondaryLabel?: string;
}) {
  return (
    <section className="cta-glow bg-green-800 py-[90px] text-center text-white">
      <div className="wrap relative">
        <h2 className="mb-4 text-[clamp(30px,3.6vw,46px)] font-extrabold leading-[1.05] tracking-[-0.025em]">
          {title}
        </h2>
        <p className="mx-auto mb-[30px] max-w-[540px] text-[19px] text-on-dark-2">
          {lead}
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Button href={primaryHref} size="lg">
            {primaryLabel}
          </Button>
          {/* Opens the default GHL booking calendar in a modal when configured
              (NEXT_PUBLIC_GHL_CALENDAR_ID); otherwise links to secondaryHref. */}
          <ScheduleCallButton
            fallbackHref={secondaryHref}
            dialogLabel="Talk to a loan officer"
            variant="ghostDark"
            size="lg"
            aria-label={secondaryLabel}
          >
            {secondaryLabel}
          </ScheduleCallButton>
        </div>
      </div>
    </section>
  );
}
