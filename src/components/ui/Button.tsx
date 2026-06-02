import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "@/lib/cn";

type Variant = "green" | "ghostDark" | "white" | "dark" | "ghost";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-full border border-transparent font-semibold tracking-[-0.01em] whitespace-nowrap cursor-pointer transition-[background,color,border-color,transform,box-shadow] duration-200 active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-spring-3 disabled:opacity-55 disabled:pointer-events-none";

const variants: Record<Variant, string> = {
  green: "bg-spring text-[#04130c] font-bold hover:bg-spring-3",
  ghostDark:
    "text-white border-hair-dark bg-white/[0.02] hover:bg-white/[0.08]",
  white: "bg-white text-ink hover:bg-[#eef0ea]",
  dark: "bg-ink text-white hover:bg-[#16352a]",
  ghost: "text-ink hover:bg-paper-2",
};

const sizes: Record<Size, string> = {
  sm: "h-[38px] px-4 text-[14px]",
  md: "h-[46px] px-[22px] text-[15px]",
  lg: "h-[54px] px-7 text-[16px]",
};

type CommonProps = {
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
};

type AsButton = CommonProps &
  Omit<ComponentPropsWithoutRef<"button">, keyof CommonProps> & {
    href?: undefined;
  };

type AsLink = CommonProps &
  Omit<ComponentPropsWithoutRef<"a">, keyof CommonProps> & { href: string };

export type ButtonProps = AsButton | AsLink;

/** Pill button/link. Renders a Next <Link> for internal hrefs, an <a> for
 *  external/tel/mailto hrefs, and a <button> when no href is given. */
export function Button({
  variant = "green",
  size = "md",
  className,
  children,
  ...rest
}: ButtonProps) {
  const classes = cn(base, variants[variant], sizes[size], className);

  if ("href" in rest && rest.href !== undefined) {
    const { href, ...anchorRest } = rest;
    const isInternal = href.startsWith("/") && !href.startsWith("//");
    if (isInternal) {
      return (
        <Link href={href} className={classes} {...anchorRest}>
          {children}
        </Link>
      );
    }
    return (
      <a href={href} className={classes} {...anchorRest}>
        {children}
      </a>
    );
  }

  const { type, ...buttonRest } = rest as AsButton;
  return (
    <button type={type ?? "button"} className={classes} {...buttonRest}>
      {children}
    </button>
  );
}
