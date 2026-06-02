import { Nav } from "@/components/nav/Nav";
import { Footer } from "@/components/Footer";

/** Wraps all public marketing pages with the global nav + footer. */
export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Nav />
      <main id="main">{children}</main>
      <Footer />
    </>
  );
}
