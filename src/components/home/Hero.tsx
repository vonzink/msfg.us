import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { HeroBloomShell } from "@/components/home/HeroBloomShell";
import { getTenantConfig } from "@/server/tenant/config";

/** Ambient topographic rings (design handoff): 5 mint contour circles that
 *  slowly drift/scale. Pure CSS animation — server-rendered, aria-hidden. */
function TopoRings() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 1000 1000"
      preserveAspectRatio="xMidYMid slice"
      className="pointer-events-none absolute left-1/2 top-0 h-[1300px] w-[1300px] -translate-x-1/2"
    >
      {[120, 220, 320, 420, 520].map((r, i) => (
        <circle
          key={r}
          cx="500"
          cy="430"
          r={r}
          fill="none"
          className="ring-drift stroke-mint"
          strokeWidth="1"
          style={{
            opacity: 0.06 + i * 0.004,
            ["--ring-dur" as string]: `${26 + i * 5}s`,
            ["--ring-delay" as string]: `${i * 0.6}s`,
          }}
        />
      ))}
    </svg>
  );
}

export async function Hero() {
  const config = await getTenantConfig();
  return (
    <section id="top" className="hero-bg relative px-0 pb-[72px] pt-10 text-white">
      <TopoRings />
      <div className="wrap relative flex flex-col items-center text-center">
        <HeroBloomShell
          logoSrc={config.brand.logos.mark}
          logoAlt={config.brand.legalName}
          assistantName={config.brand.assistantName}
          shortName={config.brand.shortName}
          iconSrc={config.brand.logos.horizontal}
          headline={
            <>
              <h1 className="m-0 max-w-[18ch] text-balance text-[clamp(32px,4.4vw,54px)] font-extrabold leading-[1.04] tracking-[-0.035em] text-mint">
                Expert Mortgage Guidance from Seasoned Professionals
              </h1>
              <p className="mt-3.5 max-w-[40ch] text-balance text-[clamp(16px,1.9vw,20px)] font-medium tracking-[-0.01em] text-on-dark-2">
                Personal, transparent home financing across seven states.
              </p>
            </>
          }
          stats={
            <dl className="mt-7 flex justify-center gap-12 max-[980px]:gap-9">
              {config.marketing?.stats.map((s) => (
                <div key={s.label}>
                  <dd className="m-0 whitespace-nowrap text-[clamp(34px,4vw,46px)] font-extrabold tracking-[-0.03em] text-on-dark-3">
                    {s.num}
                  </dd>
                  <dt className="mt-0.5 text-[14px] text-on-dark-2">{s.label}</dt>
                </div>
              ))}
            </dl>
          }
        />

        <Link
          href="/apply/buy"
          className="pill-glow mt-4 inline-flex items-center gap-2 rounded-full bg-mint px-6 py-[13px] text-[17px] font-semibold text-green-900 transition-transform hover:-translate-y-0.5"
        >
          Start an application <ArrowRight className="size-[17px]" strokeWidth={2.4} />
        </Link>
      </div>
    </section>
  );
}
