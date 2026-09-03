// Confirms the hosted embedding endpoint (EMBEDDING_API_URL) produces the
// same vectors as the local all-MiniLM-L6-v2 model — so it's safe to query
// against the 387 vectors already in the database without re-embedding.
//
//   EMBEDDING_API_URL=... EMBEDDING_API_KEY=... \
//     pnpm --filter backend embed:verify
//
// Exits non-zero if any probe's API-vs-local cosine similarity < THRESHOLD.
// If it fails, re-embed everything with the API backend:
//   EMBEDDING_API_URL=... pnpm --filter backend backfill:embeddings --all

import "dotenv/config";
import { EMBEDDING_DIM, embedWith } from "@repo/shared/embed";

const THRESHOLD = 0.999;

const PROBES = [
  "finding songs related to tv shows",
  "real-time cryptocurrency prices and market data",
  "weather forecast for a city",
  "send transactional email to users",
  "convert between world currencies",
  "look up a company by domain name",
  "generate a random inspirational quote",
];

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot; // both vectors are unit-length
}

async function main() {
  if (!process.env.EMBEDDING_API_URL) {
    console.error(
      "❌ EMBEDDING_API_URL is not set — nothing to verify. Set it (and EMBEDDING_API_KEY) to the hosted endpoint.",
    );
    process.exit(1);
  }
  console.log(`Endpoint: ${process.env.EMBEDDING_API_URL}\n`);

  let worst = 1;
  let failed = false;

  for (const probe of PROBES) {
    const [local, api] = await Promise.all([
      embedWith("local", probe),
      embedWith("api", probe),
    ]);
    if (api.length !== EMBEDDING_DIM) {
      console.error(`✗ "${probe}" — API returned ${api.length} dims`);
      failed = true;
      continue;
    }
    const sim = cosine(local, api);
    worst = Math.min(worst, sim);
    const ok = sim >= THRESHOLD;
    if (!ok) failed = true;
    console.log(`${ok ? "✓" : "✗"} ${sim.toFixed(5)}  "${probe}"`);
  }

  console.log(`\nWorst similarity: ${worst.toFixed(5)} (threshold ${THRESHOLD})`);
  if (failed) {
    console.error(
      "\n❌ The endpoint does not match the local model closely enough.\n" +
        "   Re-embed the catalog with it before switching:\n" +
        "   EMBEDDING_API_URL=... pnpm --filter backend backfill:embeddings --all",
    );
    process.exit(1);
  }
  console.log(
    "\n✅ Parity confirmed — the hosted endpoint is safe to use against the existing vectors.",
  );
}

main().catch((e) => {
  console.error("❌ embed:verify failed:", e);
  process.exit(1);
});
