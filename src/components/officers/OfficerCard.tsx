"use client";

import { useId, useState } from "react";
import Image from "next/image";
import {
  MapPin,
  Phone,
  MessageSquareText,
  Mail,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { stateName, telDigits, type Officer } from "@/content/officers";
import { cn } from "@/lib/cn";

/**
 * A single loan officer card (Client Component — owns its bio-expander state).
 * White, squared, lifts 3px on hover. Collapsed it stays compact; the "Read
 * bio" toggle grows the card in place to reveal the bio (animated via a
 * grid-rows 0fr→1fr reveal). Actions: Apply (primary) plus Call / Text / Email.
 */
export function OfficerCard({ officer }: { officer: Officer }) {
  const { slug, name, title, nmls, email, phone, states, photo, bio, applyHref } =
    officer;
  const [open, setOpen] = useState(false);
  const bioId = useId();
  const tel = telDigits(phone);
  const hasBio = bio.length > 0;

  return (
    <article
      id={slug}
      className="flex scroll-mt-24 flex-col gap-3.5 rounded-xl border-[1.5px] border-line bg-white p-[22px] shadow-card transition-[transform,box-shadow] duration-200 hover:-translate-y-[3px] hover:shadow-pop"
    >
      {/* Top: headshot + identity */}
      <div className="flex items-center gap-3.5">
        <div className="relative h-[68px] w-[68px] flex-none overflow-hidden rounded-[18px] border border-line bg-paper-2">
          <Image
            src={photo}
            alt={name}
            fill
            sizes="68px"
            className="object-cover object-top"
          />
        </div>
        <div className="min-w-0">
          <div className="text-[18px] font-extrabold tracking-[-0.01em]">
            {name}
          </div>
          <div className="mt-0.5 text-[13px] font-bold text-green-600">
            {title}
          </div>
          <div className="mt-0.5 text-[12.5px] font-semibold text-muted">
            NMLS #{nmls}
          </div>
        </div>
      </div>

      {/* Licensed states */}
      <div className="flex items-start gap-1.5 text-[13px] text-muted">
        <MapPin aria-hidden className="mt-0.5 h-3.5 w-3.5 flex-none" />
        <span>Licensed in {states.map((s) => stateName(s)).join(" · ")}</span>
      </div>

      {/* Bio expander — grows the card in place */}
      {hasBio && (
        <div>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls={bioId}
            className="inline-flex items-center gap-1 rounded-sm text-[13px] font-bold text-green-700 transition-colors hover:text-green-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-spring-3"
          >
            {open ? "Hide bio" : "Read bio"}
            <ChevronDown
              aria-hidden
              className={cn(
                "h-4 w-4 transition-transform duration-200",
                open && "rotate-180",
              )}
            />
          </button>
          <div
            id={bioId}
            className={cn(
              "grid transition-[grid-template-rows] duration-300 ease-out",
              open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
            )}
          >
            <div className="overflow-hidden">
              <div className="space-y-2.5 pt-2.5 text-[13.5px] leading-relaxed text-ink/80">
                {bio.map((paragraph, i) => (
                  <p key={i}>{paragraph}</p>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col gap-2 pt-1">
        <Button
          href={applyHref}
          variant="green"
          size="sm"
          target="_blank"
          rel="noopener noreferrer"
          className="w-full"
          aria-label={`Apply now with ${name}`}
        >
          Apply now
        </Button>
        <div className="grid grid-cols-3 gap-2">
          <Button
            href={`tel:${tel}`}
            variant="ghost"
            size="sm"
            className="w-full gap-1.5 border-[1.5px] border-line px-2"
            aria-label={`Call ${name}`}
          >
            <Phone aria-hidden className="h-4 w-4" /> Call
          </Button>
          <Button
            href={`sms:${tel}`}
            variant="ghost"
            size="sm"
            className="w-full gap-1.5 border-[1.5px] border-line px-2"
            aria-label={`Text ${name}`}
          >
            <MessageSquareText aria-hidden className="h-4 w-4" /> Text
          </Button>
          <Button
            href={`mailto:${email}`}
            variant="ghost"
            size="sm"
            className="w-full gap-1.5 border-[1.5px] border-line px-2"
            aria-label={`Email ${name}`}
          >
            <Mail aria-hidden className="h-4 w-4" /> Email
          </Button>
        </div>
      </div>
    </article>
  );
}
