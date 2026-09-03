/*
embedding column |  data | stores each API's 384-dim vector
pgvector extension |  capability | teaches Postgres the vector type + distance math (<=>)
HNSW index | index structure | makes ORDER BY embedding <=> ... LIMIT 10 fast instead of scanning every row
*/

import "dotenv/config";
import { prisma } from "@repo/shared";
import { apiEmbeddingText, embed, toVectorLiteral } from "@repo/shared/embed";

type Row = {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
};

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("❌ ERROR: DATABASE_URL is missing.");
    process.exit(1);
  }

  const all = process.argv.includes("--all");

  // makes sure the pgvector extension and a fast search index (HNSW) exist on the database.

  await prisma.$executeRawUnsafe("CREATE EXTENSION IF NOT EXISTS vector");
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS api_embedding_hnsw
       ON "Api" USING hnsw (embedding vector_cosine_ops)`,
  );

  const rows = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT id, name, description, category, tags
       FROM "Api"
      ${all ? "" : "WHERE embedding IS NULL"}
      ORDER BY "createdAt"`,
  );

  console.log(
    `${rows.length} API(s) to embed${all ? " (--all)" : " (missing only)"}.`,
  );

  let done = 0;
  for (const row of rows) {
    const vec = await embed(apiEmbeddingText(row));
    await prisma.$executeRaw`
      UPDATE "Api" SET embedding = ${toVectorLiteral(vec)}::vector WHERE id = ${row.id}`;
    done++;
    if (done % 25 === 0 || done === rows.length) {
      process.stdout.write(`  ${done}/${rows.length}\n`);
    }
  }

  console.log("✅ Backfill complete.");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("❌ Backfill failed:", e);
  await prisma.$disconnect();
  process.exit(1);
});
