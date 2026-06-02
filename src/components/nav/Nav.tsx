import Link from "next/link";
import { ChevronDown, Phone } from "lucide-react";
import { Mark } from "@/components/ui/Mark";
import { Button } from "@/components/ui/Button";
import { MobileDrawer } from "@/components/nav/MobileDrawer";
import { NavAuthLink } from "@/components/nav/NavAuthLink";
import { NAV } from "@/content/nav";
import { SITE } from "@/content/site";

/**
 * Sticky dark nav. Desktop shows hover/focus dropdowns (CSS-only, keyboard
 * accessible via group-focus-within). Below 980px the links collapse into the
 * MobileDrawer hamburger.
 */
export function Nav() {
  return (
    <header className="sticky top-0 z-[60] bg-green-800">
      <div className="wrap flex h-[76px] items-center gap-2">
        <Link
          href="/"
          aria-label="MSFG home"
          className="mr-[18px] flex items-center gap-2.5"
        >
          <Mark size={30} />
          <span className="text-[23px] font-extrabold tracking-[-0.03em] text-white">
            MSFG
          </span>
        </Link>

        <nav
          aria-label="Primary"
          className="hidden items-center gap-0.5 min-[981px]:flex"
        >
          {NAV.map((item) => (
            <div key={item.label} className="group relative">
              <Link
                href={item.href}
                aria-haspopup="true"
                className="inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-[15.5px] font-medium text-on-dark transition-colors group-hover:bg-white group-hover:text-ink group-focus-within:bg-white group-focus-within:text-ink"
              >
                {item.label}
                <ChevronDown
                  className="size-3.5 opacity-60 transition-transform duration-200 group-hover:rotate-180 group-focus-within:rotate-180"
                  strokeWidth={2.2}
                />
              </Link>
              <div className="invisible absolute left-0 top-[calc(100%+8px)] z-[70] min-w-[320px] -translate-y-1.5 rounded-lg bg-white p-3 opacity-0 shadow-pop transition-[opacity,transform,visibility] duration-150 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100">
                {item.items.map((sub) => (
                  <Link
                    key={sub.label}
                    href={sub.href}
                    className="flex items-center gap-2.5 rounded-md px-3.5 py-[11px] text-[16px] font-medium text-ink transition-colors hover:bg-paper-2"
                  >
                    {sub.label}
                    {sub.badge && (
                      <span className="ml-auto rounded-full bg-[#FBE6A2] px-2 py-0.5 text-[11px] font-bold text-[#6B5410]">
                        {sub.badge}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3.5">
          <a
            href={SITE.phoneHref}
            aria-label="Call us"
            className="flex size-11 items-center justify-center rounded-full border border-hair-dark text-white transition-colors hover:bg-white/[0.08]"
          >
            <Phone className="size-[19px]" strokeWidth={1.8} />
          </a>
          <NavAuthLink />
          <Button href="/apply/buy" size="sm">
            Get started
          </Button>
          <MobileDrawer />
        </div>
      </div>
    </header>
  );
}
