// Runs in CI on every PR that touches prisma/community-apis/**. Deliberately
// has no DB access and needs no secrets — it must be safe to run against a
// pull request from an untrusted fork. Only validate and report happens here;
// nothing is written until a maintainer merges (see import community apis.ts).
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateApiSubmission } from "@repo/shared";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(__dirname, "..", "prisma", "community-apis");

async function checkReachable(baseUrl: string): Promise<boolean> {
  try {
    const res = await fetch(baseUrl, {
      method: "HEAD",
      signal: AbortSignal.timeout(5000),
    });
    return res.status < 500;
  } catch {
    return false;
  }
}

async function main() {
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".json"));

  if (files.length === 0) {
    console.log("No community API submissions changed — nothing to validate.");
    return;
  }

  let hasErrors = false;

  for (const file of files) {
    let raw: unknown;
    try {
      raw = JSON.parse(await fs.readFile(path.join(dir, file), "utf8"));
    } catch (e: any) {
      hasErrors = true;
      console.error(`✗ ${file}: invalid JSON — ${e.message}`);
      continue;
    }

    const result = validateApiSubmission(raw);
    if (!result.ok) {
      hasErrors = true;
      console.error(`✗ ${file}`);
      for (const err of result.errors) console.error(`    - ${err}`);
      continue;
    }

    console.log(`✓ ${file} (${result.value.name})`);

    // Reachability is informational only  a flaky third-party API shouldn't
    // block a PR, but a reviewer should see it before approving.
    const reachable = await checkReachable(result.value.baseUrl);
    if (!reachable) {
      console.warn(`    ⚠ baseUrl did not respond: ${result.value.baseUrl}`);
    }
  }

  if (hasErrors) {
    console.error("\nOne or more community API submissions failed validation.");
    process.exit(1);
  }
  console.log(
    `\nAll ${files.length} community API submission(s) passed validation.`,
  );
}

main();
