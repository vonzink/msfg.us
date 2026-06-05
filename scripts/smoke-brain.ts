/**
 * Dev smoke test: ask the Mortgage Brain a real question through our HTTP client,
 * exercising the exact wire mapping the app uses. Requires the brain running.
 *
 * Usage:
 *   npx tsx scripts/smoke-brain.ts "Can I use gift funds for my down payment?" [baseUrl]
 * Default baseUrl: http://localhost:8080
 */
import { HttpMortgageBrainClient } from "../src/server/ai/brain/httpBrainClient";

async function main() {
  const question = process.argv[2] ?? "Can I use gift funds for my down payment?";
  const baseUrl = process.argv[3] ?? process.env.BRAIN_BASE_URL ?? "http://localhost:8080";
  const client = new HttpMortgageBrainClient({ baseUrl });
  const out = await client.ask({
    sessionId: `smoke-${Date.now()}`,
    question,
    clientIp: "127.0.0.1",
  });
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
