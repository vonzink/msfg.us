/**
 * Apply-flow chrome wrapper. Deliberately does NOT render the marketing
 * Nav/Footer — the wizard owns its own chrome (sticky top bar, progress,
 * floating "Ask AI"). The sticky bar + progress live in the client `Wizard`
 * because they depend on step state; this layout only sets the full-height
 * cream stage background.
 */
export default function ApplyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main id="main" className="flex min-h-screen flex-col bg-paper text-ink">
      {children}
    </main>
  );
}
