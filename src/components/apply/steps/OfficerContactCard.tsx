"use client";

import { Phone, MessageSquare, Mail } from "lucide-react";
import { telDigits } from "@/content/officers";

const ACTION =
  "flex flex-1 flex-col items-center gap-1 rounded-lg border-[1.5px] border-line bg-white py-3 text-[13px] font-semibold text-ink transition-colors hover:bg-paper-2";

/** Inline "reach your chosen loan officer" card: photo + name + NMLS, with
 *  direct Call / Text / Email actions using the officer's real phone/email. */
export function OfficerContactCard({
  officer,
}: {
  officer: { name: string; nmls: string; photo: string; email: string; phone: string };
}) {
  const tel = telDigits(officer.phone);
  return (
    <div className="rounded-lg border-[1.5px] border-line bg-paper-2 p-4">
      <div className="mb-3 flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={officer.photo} alt="" className="size-12 rounded-full object-cover" />
        <div>
          <p className="text-[15px] font-bold text-ink">{officer.name}</p>
          <p className="text-[13px] text-muted">NMLS #{officer.nmls}</p>
        </div>
      </div>
      <div className="flex gap-2.5">
        <a href={`tel:${tel}`} className={ACTION}>
          <Phone className="size-5 text-green-600" aria-hidden="true" />
          Call
        </a>
        <a href={`sms:${tel}`} className={ACTION}>
          <MessageSquare className="size-5 text-green-600" aria-hidden="true" />
          Text
        </a>
        <a href={`mailto:${officer.email}`} className={ACTION}>
          <Mail className="size-5 text-green-600" aria-hidden="true" />
          Email
        </a>
      </div>
    </div>
  );
}
