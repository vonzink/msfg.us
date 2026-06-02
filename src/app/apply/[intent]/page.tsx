import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Wizard } from "@/components/apply/Wizard";
import { FLOW, INTENTS, type Intent } from "@/content/flows";

/** Pre-render buy / refi / cash at build time. */
export function generateStaticParams() {
  return INTENTS.map((intent) => ({ intent }));
}

export const metadata: Metadata = {
  // noindex is handled globally for non-prod; this is just the page title.
  title: "Start your application",
  description:
    "Start your MSFG application — a few quick questions to personalize your offer.",
};

function isIntent(value: string): value is Intent {
  return (INTENTS as readonly string[]).includes(value);
}

export default async function ApplyIntentPage({
  params,
}: {
  params: Promise<{ intent: string }>;
}) {
  const { intent } = await params;
  if (!isIntent(intent) || !FLOW[intent]) notFound();

  return <Wizard intent={intent} />;
}
