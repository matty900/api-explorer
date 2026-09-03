// Diagnoses the semantic search pipeline layer by layer to see exactly where it breaks

import "dotenv/config";
import { prisma } from "@repo/shared";
import { apiEmbeddingText, embed, toVectorLiteral } from "@repo/shared/embed";

const query =
  process.argv.slice(2).join(" ") || "finding songs related to tv shows";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("❌ DATABASE_URL is missing.");
    process.exit(1);
  }

  // 1 — the local model
  console.log("1. Embedding model");
  const t0 = Date.now();
  const vec = await embed(query);
  console.log(
    `   ✓ embedded "${query}" → ${vec.length} dims in ${Date.now() - t0}ms\n`,
  );

  // 2 — catalog + embedding coverage
  const [{ total }] = await prisma.$queryRawUnsafe<Array<{ total: number }>>(
    `SELECT COUNT(*)::int AS total FROM "Api"`,
  );
  const [{ withvec }] = await prisma.$queryRawUnsafe<
    Array<{ withvec: number }>
  >(`SELECT COUNT(*)::int AS withvec FROM "Api" WHERE embedding IS NOT NULL`);
  console.log("2. Catalog");
  console.log(`   ${total} APIs total, ${withvec} with an embedding`);
  if (withvec === 0) {
    console.log(
      "   ❌ No embeddings stored. Run: pnpm --filter backend backfill:embeddings\n",
    );
    await prisma.$disconnect();
    process.exit(1);
  }
  if (withvec < total) {
    console.log(
      "   ⚠️  Some APIs have no embedding — run backfill:embeddings to cover them\n",
    );
  } else {
    console.log("   ✓ full coverage\n");
  }

  // 3 — nearest neighbours by cosine distance
  console.log("3. Top 10 semantic matches (cosine distance, lower = closer)");
  const rows = await prisma.$queryRawUnsafe<
    Array<{ name: string; category: string; distance: number }>
  >(
    `SELECT name, category, (embedding <=> $1::vector) AS distance
       FROM "Api"
      WHERE embedding IS NOT NULL
      ORDER BY distance
      LIMIT 10`,
    toVectorLiteral(vec),
  );
  for (const r of rows) {
    console.log(`   ${r.distance.toFixed(3)}  ${r.name}  (${r.category})`);
  }

  // 4 — sanity: two hand written descriptions should be closer to each sother than to something unrelated
  const [a, b, c] = await Promise.all([
    embed("service that returns song and soundtrack information"),
    embed("database of music tracks and albums"),
    embed("current weather conditions for a location"),
  ]);
  const dot = (x: number[], y: number[]) =>
    x.reduce((s, v, i) => s + v * y[i], 0);
  console.log("\n4. Model sanity check (cosine similarity)");
  console.log(`   music ↔ music   ${dot(a, b).toFixed(3)}  (should be high)`);
  console.log(`   music ↔ weather ${dot(a, c).toFixed(3)}  (should be low)`);

  await prisma.$disconnect();
  console.log(
    "\n✅ Pipeline is working. If the extension still shows nothing,",
  );
  console.log(
    "   it's pointed at the deployed backend — set apiExplorer.backendUrl",
  );
  console.log(
    "   to http://localhost:3000 and run `pnpm dev` in packages/backend.",
  );
}

main().catch(async (e) => {
  console.error("❌ doctor failed:", e);
  await prisma.$disconnect();
  process.exit(1);
});
