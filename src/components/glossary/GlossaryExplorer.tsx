"use client";

import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import type { GlossaryLetter } from "@/content/glossary";
import { cn } from "@/lib/cn";

const PAGE_PATH = "/resources/mortgage-glossary";
const NAV_LETTERS = ["#", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")];
/** Offset so anchored headings clear the sticky nav. */
const SCROLL_OFFSET = "scroll-mt-[140px]";

export function GlossaryExplorer({ sections }: { sections: GlossaryLetter[] }) {
  const [query, setQuery] = useState("");
  const [activeAnchor, setActiveAnchor] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const sectionRefs = useRef<Map<string, HTMLElement>>(new Map());

  // label -> anchor (only letters that actually have a section)
  const anchorByLabel = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of sections) m.set(s.label, s.anchor);
    return m;
  }, [sections]);

  const q = query.trim().toLowerCase();

  // Filtered view: keep only terms whose NAME matches the query.
  const visibleSections = useMemo(() => {
    if (!q) return sections;
    return sections
      .map((s) => ({ ...s, terms: s.terms.filter((t) => t.term.toLowerCase().includes(q)) }))
      .filter((s) => s.terms.length > 0);
  }, [sections, q]);

  const visibleLabels = useMemo(() => new Set(visibleSections.map((s) => s.label)), [visibleSections]);
  const totalVisible = visibleSections.reduce((n, s) => n + s.terms.length, 0);

  // Smooth-scroll a term/section into view and flag it for a brief highlight.
  function scrollToTerm(slug: string) {
    const el = document.getElementById(slug);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    setHighlight(slug);
    window.setTimeout(() => setHighlight((cur) => (cur === slug ? null : cur)), 2200);
  }

  // Deep link: on mount, honor ?term=<slug> from the URL.
  useEffect(() => {
    const slug = new URLSearchParams(window.location.search).get("term");
    if (slug) requestAnimationFrame(() => scrollToTerm(slug));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Track which section is active for nav highlighting.
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActiveAnchor((e.target as HTMLElement).dataset.anchor ?? null);
        }
      },
      { rootMargin: "-140px 0px -65% 0px", threshold: 0 },
    );
    sectionRefs.current.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [visibleSections]);

  function onTermClick(e: MouseEvent<HTMLAnchorElement>, slug: string) {
    e.preventDefault();
    window.history.replaceState(null, "", `${PAGE_PATH}?term=${slug}`);
    scrollToTerm(slug);
  }

  return (
    <div>
      {/* Filter */}
      <div className="mx-auto mb-8 max-w-[560px]">
        <label htmlFor="glossary-filter" className="sr-only">
          Filter glossary terms
        </label>
        <div className="relative">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            id="glossary-filter"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter terms…"
            className="h-[52px] w-full rounded-full border border-line bg-white pl-12 pr-5 text-[16px] text-ink outline-none focus-visible:border-green-600 focus-visible:ring-2 focus-visible:ring-spring-soft"
          />
        </div>
      </div>

      {/* Sticky A–Z nav */}
      <nav
        aria-label="Jump to letter"
        className="sticky top-0 z-30 -mx-4 mb-10 border-y border-line bg-paper/95 px-4 py-3 backdrop-blur"
      >
        <ul className="flex flex-wrap justify-center gap-1 max-[600px]:flex-nowrap max-[600px]:justify-start max-[600px]:overflow-x-auto">
          {NAV_LETTERS.map((label) => {
            const anchor = anchorByLabel.get(label);
            const enabled = anchor !== undefined && visibleLabels.has(label);
            return (
              <li key={label}>
                {enabled ? (
                  <a
                    href={`#${anchor}`}
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-md text-[14px] font-semibold text-ink hover:bg-paper-2",
                      activeAnchor === anchor && "bg-green-900 text-white hover:bg-green-900",
                    )}
                  >
                    {label}
                  </a>
                ) : (
                  <span
                    aria-disabled="true"
                    className="flex h-9 w-9 items-center justify-center rounded-md text-[14px] font-semibold text-line"
                  >
                    {label}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Body */}
      {totalVisible === 0 ? (
        <p className="py-16 text-center text-[17px] text-muted">
          No terms match "{query.trim()}".
        </p>
      ) : (
        <div className="space-y-14">
          {visibleSections.map((s) => (
            <section
              key={s.anchor}
              id={s.anchor}
              data-anchor={s.anchor}
              ref={(el) => {
                if (el) sectionRefs.current.set(s.anchor, el);
                else sectionRefs.current.delete(s.anchor);
              }}
              className={SCROLL_OFFSET}
            >
              <h2 className="mb-5 border-b border-line pb-2 text-[28px] font-extrabold tracking-[-0.02em] text-green-900">
                {s.label}
              </h2>
              <dl className="space-y-7">
                {s.terms.map((t) => (
                  <div
                    key={t.slug}
                    id={t.slug}
                    className={cn(
                      SCROLL_OFFSET,
                      "rounded-lg transition-colors duration-500",
                      highlight === t.slug && "bg-spring-soft/40 ring-2 ring-spring-soft",
                    )}
                  >
                    <dt className="text-[18px] font-bold text-ink">
                      <a
                        href={`${PAGE_PATH}?term=${t.slug}`}
                        onClick={(e) => onTermClick(e, t.slug)}
                        className="hover:text-green-600 hover:underline"
                      >
                        {t.term}
                      </a>
                    </dt>
                    <dd className="mt-1.5 text-[15.5px] leading-[1.6] text-muted">{t.definition}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
