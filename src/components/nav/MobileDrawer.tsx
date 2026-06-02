"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Menu, X, ChevronDown, Phone } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { NAV } from "@/content/nav";
import { SITE } from "@/content/site";
import { cn } from "@/lib/cn";

/** Hamburger + full-screen drawer for < 980px. Each nav item expands to its
 *  sub-links; primary CTAs are pinned to the bottom. */
export function MobileDrawer() {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <div className="min-[981px]:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        aria-expanded={open}
        className="flex size-11 items-center justify-center rounded-full text-white"
      >
        <Menu className="size-6" />
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] flex flex-col bg-green-800 text-white">
          <div className="wrap flex h-[76px] shrink-0 items-center justify-between">
            <Link
              href="/"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5"
            >
              <span className="text-[23px] font-extrabold tracking-[-0.03em] text-white">
                MSFG
              </span>
            </Link>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close menu"
              className="flex size-11 items-center justify-center rounded-full text-white"
            >
              <X className="size-6" />
            </button>
          </div>

          <nav
            aria-label="Mobile"
            className="wrap flex-1 overflow-y-auto pb-6 pt-2"
          >
            {NAV.map((item) => {
              const isOpen = expanded === item.label;
              return (
                <div key={item.label} className="border-b border-hair-dark">
                  <div className="flex items-center">
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className="flex-1 py-4 text-[22px] font-bold tracking-[-0.02em] text-white"
                    >
                      {item.label}
                    </Link>
                    <button
                      type="button"
                      onClick={() =>
                        setExpanded(isOpen ? null : item.label)
                      }
                      aria-label={`${isOpen ? "Collapse" : "Expand"} ${item.label}`}
                      aria-expanded={isOpen}
                      className="flex size-11 items-center justify-center text-on-dark-2"
                    >
                      <ChevronDown
                        className={cn(
                          "size-5 transition-transform",
                          isOpen && "rotate-180",
                        )}
                      />
                    </button>
                  </div>
                  {isOpen && (
                    <div className="flex flex-col pb-3">
                      {item.items.map((sub) => (
                        <Link
                          key={sub.label}
                          href={sub.href}
                          onClick={() => setOpen(false)}
                          className="flex items-center gap-2 py-2.5 pl-1 text-[16px] text-on-dark-2"
                        >
                          {sub.label}
                          {sub.badge && (
                            <span className="rounded-full bg-[#FBE6A2] px-2 py-0.5 text-[11px] font-bold text-[#6B5410]">
                              {sub.badge}
                            </span>
                          )}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          <div className="wrap flex shrink-0 flex-col gap-3 border-t border-hair-dark py-5">
            <Button
              href="/apply/buy"
              size="lg"
              className="w-full"
              onClick={() => setOpen(false)}
            >
              Apply now
            </Button>
            <Button
              href={SITE.phoneHref}
              variant="ghostDark"
              size="lg"
              className="w-full"
            >
              <Phone className="size-[18px]" strokeWidth={1.8} /> Talk to a loan
              officer
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
