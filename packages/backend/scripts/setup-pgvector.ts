// One time database setup for semantic search
import "dotenv/config";
import { prisma } from "@repo/shared";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("❌ ERROR: DATABASE_URL is missing.");
    process.exit(1);
  }

  console.log("→ CREATE EXTENSION IF NOT EXISTS vector");
  await prisma.$executeRawUnsafe("CREATE EXTENSION IF NOT EXISTS vector");

  const [{ exists }] = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_name = 'Api' AND column_name = 'embedding'
     ) AS exists`,
  );

  if (exists) {
    console.log("→ CREATE INDEX api_embedding_hnsw (vector_cosine_ops)");
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS api_embedding_hnsw
         ON "Api" USING hnsw (embedding vector_cosine_ops)`,
    );
    console.log("✅ pgvector ready.");
  } else {
    console.log(
      "… Api.embedding column not found — run `prisma db push`, then re-run this script.",
    );
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("❌ setup-pgvector failed:", e);
  await prisma.$disconnect();
  process.exit(1);
});
