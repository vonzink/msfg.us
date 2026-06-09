import { AiWidget } from "@/components/home/AiWidget";
import { getTenantConfig } from "@/server/tenant/config";

export async function Hero() {
  const config = await getTenantConfig();
  return (
    <section id="top" className="hero-bg px-0 pb-[72px] pt-10 text-white">
      <div className="wrap flex flex-col items-center text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={config.brand.logos.mark}
          alt={config.brand.legalName}
          className="mb-4 h-[132px] w-auto"
        />
        <h1 className="m-0 max-w-[18ch] text-balance text-[clamp(32px,4.4vw,54px)] font-extrabold leading-[1.04] tracking-[-0.035em] text-mint">
          Expert Mortgage Guidance from Seasoned Professionals
        </h1>
        <p className="mt-3.5 max-w-[40ch] text-balance text-[clamp(16px,1.9vw,20px)] font-medium tracking-[-0.01em] text-on-dark-2">
          Personal, transparent home financing across seven states.
        </p>

        <AiWidget
          assistantName={config.brand.assistantName}
          shortName={config.brand.shortName}
          iconSrc={config.brand.logos.horizontal}
          brainEnabled={config.ai.brain?.enabled ?? false}
        />

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
      </div>
    </section>
  );
}
