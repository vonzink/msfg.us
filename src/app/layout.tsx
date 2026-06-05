import type { Metadata } from "next";
import { Hanken_Grotesk } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import { GhlChat } from "@/components/integrations/GhlChat";
import { TenantTheme } from "@/components/theme/TenantTheme";
import { getTenantConfig, getTenantOrigin } from "@/server/tenant/config";

const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-hanken",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const [config, origin] = await Promise.all([
    getTenantConfig(),
    getTenantOrigin(),
  ]);
  const { seo } = config;
  // Staging and preview environments must never be indexed.
  const isProd = process.env.NEXT_PUBLIC_SITE_ENV === "production";
  return {
    metadataBase: new URL(origin),
    title: {
      default: seo.titleDefault,
      template: seo.titleTemplate,
    },
    description: seo.description,
    applicationName: config.brand.shortName,
    keywords: seo.keywords,
    openGraph: {
      type: "website",
      siteName: seo.siteName,
      url: origin,
      title: seo.ogTitle,
      description: seo.ogDescription,
      ...(seo.ogImage ? { images: [{ url: seo.ogImage }] } : {}),
    },
    robots: isProd
      ? { index: true, follow: true }
      : { index: false, follow: false },
  };
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={hanken.variable}>
      <head>
        {/* Per-tenant CSS-var overrides — SSR'd before paint (no FOUC/CLS).
            The `no-head-element` ESLint rule skips App Router files (rule
            returns early when context.filename includes `app/`), so using a
            raw <head> element here is lint-clean. */}
        <TenantTheme />
      </head>
      <body className="min-h-screen">
        {children}
        {/* Site-wide LeadConnector live-agent chat (renders nothing unless
            NEXT_PUBLIC_GHL_CHAT_WIDGET_ID is set). Distinct from the homepage
            AI assistant. */}
        <GhlChat />
        {/* Vercel observability — both no-op outside Vercel/dev, so they're
            safe to mount unconditionally. */}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
