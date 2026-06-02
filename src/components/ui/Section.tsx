import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Light content section (96px vertical padding). `alt` swaps to the
 *  paper-2 background used for alternating bands. */
export function Section({
  alt,
  id,
  className,
  children,
}: {
  alt?: boolean;
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className={cn("py-24 text-ink", alt ? "bg-paper-2" : "bg-paper", className)}
    >
      <div className="wrap">{children}</div>
    </section>
  );
}

export function Eyebrow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "text-[13px] font-semibold tracking-[0.02em] text-spring-3",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SectionHead({
  eyebrow,
  title,
  lead,
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  lead?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-12 max-w-[720px]", className)}>
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <h2 className="mt-2.5 text-[clamp(30px,3.6vw,46px)] font-extrabold leading-[1.05] tracking-[-0.025em]">
        {title}
      </h2>
      {lead && <p className="mt-3.5 text-[19px] text-muted">{lead}</p>}
    </div>
  );
}
