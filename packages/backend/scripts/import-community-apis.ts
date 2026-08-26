// Runs in CI on push to main, after a community apis/** PR has already been human reviewed and merged
// Needs DATABASE_URL (repo secret)
// against unmerged/untrusted PR content (see validate-community-apis.ts).

import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { addApi, prisma } from "@repo/shared";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(__dirname, "..", "prisma", "community-apis");

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("❌ ERROR: DATABASE_URL is missing.");
    process.exit(1);
  }

  const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".json"));
  let imported = 0;
  let failed = 0;

  for (const file of files) {
    const raw = JSON.parse(await fs.readFile(path.join(dir, file), "utf8"));
    const result = await addApi(raw);
    if (!result.ok) {
      failed++;
      console.error(`✗ ${file}: ${result.errors.join("; ")}`);
      continue;
    }
    imported++;
    console.log(`✓ ${file} -> ${result.api.name}`);
  }

  console.log(`\n${imported} imported, ${failed} failed.`);
  await prisma.$disconnect();
  if (failed > 0) process.exit(1);
}

main().catch(async (e) => {
  console.error("❌ Import failed:", e);
  await prisma.$disconnect();
  process.exit(1);
});
