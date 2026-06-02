import type { Metadata } from "next";
import { Hanken_Grotesk } from "next/font/google";
import "./globals.css";
import { SITE } from "@/content/site";

const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-hanken",
  display: "swap",
});

const isProd = process.env.NEXT_PUBLIC_SITE_ENV === "production";

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: "MSFG — Expert Mortgage Guidance from Seasoned Professionals",
    template: "%s · MSFG",
  },
  description:
    "Mountain State Financial Group — AI-first, transparent home financing across Colorado, North Dakota, South Dakota, Minnesota, Texas, Michigan, and Indiana.",
  applicationName: "MSFG",
  openGraph: {
    type: "website",
    siteName: "MSFG",
    url: SITE.url,
    title: "MSFG — Expert Mortgage Guidance from Seasoned Professionals",
    description:
      "AI-first, transparent home financing across seven states. Real licensed loan officers, one tap away.",
  },
  // Staging and preview environments must never be indexed.
  robots: isProd
    ? { index: true, follow: true }
    : { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={hanken.variable}>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
