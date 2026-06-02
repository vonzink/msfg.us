import Link from "next/link";
import { Section, SectionHead } from "@/components/ui/Section";
import { FAMILY_OF_COMPANIES } from "@/content/site";

export function Family() {
  return (
    <Section alt id="services">
      <SectionHead
        eyebrow="One platform"
        title="Everything homeownership, under one roof."
        lead="From the first question to the keys — and everything after."
      />
      <div className="grid grid-cols-1 gap-[18px] min-[981px]:grid-cols-3">
        {FAMILY_OF_COMPANIES.map((c) => (
          <Link
            key={c.rest}
            href={c.href}
            className="rounded-lg border border-line bg-white p-[26px] transition-[transform,box-shadow] duration-200 hover:-translate-y-[3px] hover:shadow-card"
          >
            <div className="text-[19px] font-extrabold tracking-[-0.02em]">
              MSFG <span className="font-medium text-muted">{c.rest}</span>
            </div>
            <p className="mt-2.5 text-[15px] text-muted">{c.desc}</p>
          </Link>
        ))}
      </div>
    </Section>
  );
}
