import Link from "next/link";
import { buildLegalStrip } from "@/content/site";
import { getTenantConfig } from "@/server/tenant/config";
import {
  FOOTER_COLUMNS,
  FOOTER_LEGAL_LINKS,
} from "@/content/nav";

export async function Footer() {
  const config = await getTenantConfig();
  const legalStrip = buildLegalStrip(config);
  return (
    <footer className="bg-paper pb-10 pt-[72px] text-ink">
      <div className="wrap">
        <div className="grid grid-cols-1 gap-9 min-[981px]:grid-cols-[1.6fr_1fr_1fr_1.1fr]">
          {/* Brand + family of companies */}
          <div>
            <span className="text-[26px] font-extrabold tracking-[-0.03em] text-green-600">
              {config.brand.shortName}
            </span>
            <p className="my-3.5 max-w-[280px] text-[15px] text-muted">
              {config.marketing?.tagline}
            </p>
            <div className="flex flex-col gap-3.5">
              {config.marketing?.footerFamily.map((c) => (
                <div key={c.rest}>
                  <div className="text-[15px]">
                    <span className="font-extrabold text-green-600">{config.brand.shortName}</span>{" "}
                    <span className="font-bold text-[#9aa49b]">{c.rest}</span>
                  </div>
                  <p className="mt-0.5 text-[13.5px] text-muted">{c.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Link columns */}
          {FOOTER_COLUMNS.map((col) => (
            <div key={col.heading}>
              <h2 className="mb-4 text-[16px] font-bold">{col.heading}</h2>
              <ul>
                {col.links.map((l) => (
                  <li key={l.label}>
                    <Link
                      href={l.href}
                      className="block py-1.5 text-[14.5px] text-muted transition-colors hover:text-ink"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* Contact & legal */}
          <div>
            <h2 className="mb-4 text-[16px] font-bold">Contact &amp; Legal</h2>
            <ul>
              <li>
                <a
                  href={`mailto:${config.contact.email}`}
                  className="block py-1.5 text-[14.5px] text-muted transition-colors hover:text-ink"
                >
                  {config.contact.email}
                </a>
              </li>
              <li>
                <a
                  href={config.contact.phoneHref}
                  className="block py-1.5 text-[14.5px] text-muted transition-colors hover:text-ink"
                >
                  {config.contact.phoneDisplay}
                </a>
              </li>
              {FOOTER_LEGAL_LINKS.map((l) => {
                const external = l.href.startsWith("http");
                return (
                  <li key={l.label}>
                    <a
                      href={l.href}
                      {...(external
                        ? { target: "_blank", rel: "noopener noreferrer" }
                        : {})}
                      className="block py-1.5 text-[14.5px] text-muted transition-colors hover:text-ink"
                    >
                      {l.label}
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        <p className="mt-12 border-t border-line pt-6 text-[12.5px] leading-relaxed text-muted">
          {legalStrip} Hosted on AWS.
        </p>
      </div>
    </footer>
  );
}
