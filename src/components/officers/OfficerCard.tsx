import { MapPin, Languages, Star } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ScheduleCallButton } from "@/components/integrations/ScheduleCallButton";
import { officerInitials, type Officer } from "@/content/officers";
import { SITE } from "@/content/site";

/** Full state name for a USPS code, falling back to the code itself. */
function stateName(code: string): string {
  return SITE.states.find((s) => s.code === code)?.name ?? code;
}

/**
 * A single loan officer card (Server Component). White, squared, lifts 3px on
 * hover. Layout ported from the design prototype's `.of-card`.
 * Avatar is an initials tile — [PLACEHOLDER] for a real photo before launch.
 */
export function OfficerCard({ officer }: { officer: Officer }) {
  const { name, nmls, city, state, languages, specialties, rating } = officer;

  return (
    <article className="flex flex-col gap-3.5 rounded-xl border-[1.5px] border-line bg-white p-[22px] shadow-card transition-[transform,box-shadow] duration-200 hover:-translate-y-[3px] hover:shadow-pop">
      {/* Top: avatar + identity */}
      <div className="flex items-center gap-3.5">
        <div
          aria-hidden
          className="flex h-16 w-16 flex-none items-center justify-center rounded-[18px] border border-line bg-[linear-gradient(135deg,var(--color-spring-soft),var(--color-paper-2))] text-[22px] font-extrabold text-green-600"
        >
          {officerInitials(name)}
        </div>
        <div className="min-w-0">
          <div className="text-[18px] font-extrabold tracking-[-0.01em]">
            {name}
          </div>
          <div className="mt-0.5 text-[12.5px] font-semibold text-muted">
            NMLS #{nmls}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[13px] font-bold">
            <Star
              aria-hidden
              className="h-3.5 w-3.5 fill-[#F4B740] text-[#F4B740]"
            />
            {rating.avg.toFixed(1)}
            <span className="font-semibold text-muted">({rating.count})</span>
            <span className="sr-only">
              average rating from {rating.count} reviews
            </span>
          </div>
        </div>
      </div>

      {/* Specialty chips */}
      <div className="flex flex-wrap gap-1.5">
        {specialties.map((tag) => (
          <span
            key={tag}
            className="rounded-full bg-paper-2 px-2.5 py-1 text-[12px] font-bold text-ink"
          >
            {tag}
          </span>
        ))}
      </div>

      {/* Location */}
      <div className="flex items-center gap-1.5 text-[13px] text-muted">
        <MapPin aria-hidden className="h-3.5 w-3.5" />
        {city}, {stateName(state)}
      </div>

      {/* Languages */}
      <div className="flex items-center gap-1.5 text-[13px] text-muted">
        <Languages aria-hidden className="h-3.5 w-3.5" />
        {languages.join(" · ")}
      </div>

      {/* Actions */}
      <div className="mt-0.5 flex gap-2">
        <ScheduleCallButton
          calendarId={officer.calendarId}
          fallbackHref={officer.scheduleHref}
          dialogLabel={`Schedule a call with ${name}`}
          size="sm"
          className="flex-1"
          aria-label={`Schedule a call with ${name}`}
        >
          Schedule
        </ScheduleCallButton>
        <Button
          href={officer.textHref ?? "#"}
          variant="ghost"
          size="sm"
          className="flex-1 border-line"
          aria-label={`Text ${name}`}
        >
          Text
        </Button>
      </div>
    </article>
  );
}
