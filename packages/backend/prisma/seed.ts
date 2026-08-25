import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { addApi, prisma, toSlug } from "@repo/shared";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const connectionString = `${process.env.DATABASE_URL}`;

if (!connectionString || connectionString === "undefined") {
  console.error("❌ ERROR: DATABASE_URL is missing.");
  process.exit(1);
}

const APIS_GURU_LIST_URL = "https://api.apis.guru/v2/list.json";
const IMPORT_TARGET = 250;
const FETCH_CONCURRENCY = 8;

// Domain/title patterns that indicate government, municipal, or internal APIs
const SKIP_DOMAIN_RE =
  /\.gov($|\.|\/)|\.mil($|\.)|\.govt\.|\.gob\.|municipal|county\.|\.local$/i;
const SKIP_TITLE_RE =
  /\b(government|municipal|federal agency|state department|city of |county of )\b/i;

// Well-known developer-facing brands get a priority boost
const BRAND_BOOST_RE =
  /\b(stripe|github|slack|google|aws|azure|twilio|sendgrid|notion|openai|twitter|spotify|shopify|zoom|asana|trello|dropbox|discord|linkedin|facebook|paypal|hubspot|salesforce|jira|figma|linear|vercel|netlify|cloudflare|datadog|okta|auth0|mongodb|elastic|braintree|square|vonage|mailgun|postmark)\b/i;

// APIs.guru category → display category
const CATEGORY_MAP: Record<string, string> = {
  developer_tools: "Developer",
  cloud: "Cloud",
  financial: "Finance",
  communication: "Communication",
  entertainment: "Entertainment",
  social: "Social",
  analytics: "Analytics",
  productivity: "Productivity",
  messaging: "Communication",
  search: "Developer",
  marketing: "Marketing",
  open_data: "Data",
  sports: "Sports",
  weather: "Weather",
  health: "Health",
  iot: "IoT",
  ecommerce: "E-Commerce",
  media: "Media",
  security: "Security",
};

// Priority score per category (higher = import first)
const CATEGORY_PRIORITY: Record<string, number> = {
  developer_tools: 10,
  cloud: 9,
  financial: 8,
  communication: 8,
  ecommerce: 8,
  security: 7,
  entertainment: 7,
  social: 7,
  analytics: 7,
  productivity: 7,
  messaging: 6,
  search: 6,
  marketing: 6,
  media: 6,
  open_data: 5,
  sports: 4,
  weather: 4,
  health: 4,
  iot: 3,
};

async function fetchJson(url: string, timeoutMs = 20000): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function extractAuthType(spec: any): string {
  const defs =
    spec.securityDefinitions ?? spec.components?.securitySchemes ?? {};
  const types = Object.values(defs) as any[];
  if (types.some((d) => d.type === "oauth2")) return "oauth2";
  if (types.some((d) => d.type === "http" && d.scheme === "bearer"))
    return "bearer";
  if (types.some((d) => d.type === "apiKey")) return "apiKey";
  if (types.some((d) => d.type === "http" && d.scheme === "basic"))
    return "basic";
  return "none";
}

function extractBaseUrl(spec: any): string {
  if (spec.openapi?.startsWith("3.")) return spec.servers?.[0]?.url ?? "";
  if (spec.swagger === "2.0") {
    const scheme = spec.schemes?.[0] ?? "https";
    const host = spec.host ?? "";
    const base = spec.basePath === "/" ? "" : (spec.basePath ?? "");
    return `${scheme}://${host}${base}`;
  }
  return "";
}

function extractEndpoints(spec: any): any[] {
  const paths = spec.paths ?? {};
  const endpoints: any[] = [];
  const METHODS = ["get", "post", "put", "patch", "delete"];

  for (const [path, pathItem] of Object.entries(paths) as [string, any][]) {
    for (const method of METHODS) {
      const op = pathItem?.[method];
      if (!op) continue;

      const rawParams = [
        ...(pathItem.parameters ?? []),
        ...(op.parameters ?? []),
      ];
      const params = rawParams.slice(0, 5).map((p: any) => ({
        name: p.name,
        in: p.in,
        required: p.required ?? false,
        description: (p.description ?? "")
          .replace(/<[^>]*>/g, "")
          .slice(0, 100),
      }));

      endpoints.push({
        path,
        method: method.toUpperCase(),
        summary: (
          op.summary ??
          op.description ??
          `${method.toUpperCase()} ${path}`
        )
          .replace(/<[^>]*>/g, "")
          .trim()
          .slice(0, 150),
        params,
      });

      if (endpoints.length >= 25) return endpoints;
    }
  }
  return endpoints;
}

async function seedFromApisGuru() {
  console.log("\n🌐 Importing APIs from APIs.guru...");

  let list: Record<string, any>;
  try {
    list = await fetchJson(APIS_GURU_LIST_URL);
    console.log(`  Index fetched — ${Object.keys(list).length} total APIs`);
  } catch (e: any) {
    console.warn(`  ⚠️  Could not fetch APIs.guru index: ${e.message}`);
    return;
  }

  type Candidate = {
    key: string;
    score: number;
    swaggerUrl: string;
    indexCategories: string[];
  };

  // ── Step 1: score every candidate using index metadata ───────────────────
  const allScored: Candidate[] = [];

  for (const [key, entry] of Object.entries(list) as [string, any][]) {
    if (SKIP_DOMAIN_RE.test(key)) continue;

    const preferred = entry.preferred;
    const version = entry.versions?.[preferred];
    if (!version?.swaggerUrl) continue;

    const info = version.info ?? {};
    if (!(info.description ?? "").trim()) continue;
    if (SKIP_TITLE_RE.test(info.title ?? "")) continue;

    const cats: string[] = info["x-apisguru-categories"] ?? [];
    let score = cats.reduce(
      (s: number, c: string) => s + (CATEGORY_PRIORITY[c] ?? 1),
      0,
    );
    if (BRAND_BOOST_RE.test(key)) score += 20;

    allScored.push({
      key,
      score,
      swaggerUrl: version.swaggerUrl,
      indexCategories: cats,
    });
  }

  allScored.sort((a, b) => b.score - a.score);

  // ── Step 2: cap at MAX_PER_DOMAIN per root domain (e.g. "azure.com") ────
  //    Walking the sorted list means each domain keeps its *highest-scored* slots.
  const MAX_PER_DOMAIN = 2;
  const domainSlots = new Map<string, number>();
  const candidates: Candidate[] = [];

  for (const c of allScored) {
    const domain = c.key.split(":")[0];
    const used = domainSlots.get(domain) ?? 0;
    if (used >= MAX_PER_DOMAIN) continue;
    domainSlots.set(domain, used + 1);
    candidates.push(c);
  }

  console.log(
    `  ${allScored.length} scored → ${candidates.length} after domain cap` +
      ` (${domainSlots.size} unique domains in pool)`,
  );

  // ── Step 3: fetch specs in parallel batches, stop at IMPORT_TARGET ───────
  let imported = 0;
  let fetchErrors = 0;
  let tooFew = 0;
  let invalid = 0;
  const importedDomains = new Map<string, number>();

  async function processCandidate(c: Candidate): Promise<void> {
    if (imported >= IMPORT_TARGET) return;

    let spec: any;
    try {
      spec = await fetchJson(c.swaggerUrl);
    } catch {
      fetchErrors++;
      return;
    }

    const endpoints = extractEndpoints(spec);
    if (endpoints.length < 3) {
      tooFew++;
      return;
    }

    if (imported >= IMPORT_TARGET) return; // re-check after async gap

    const info = spec.info ?? {};
    const name = (info.title ?? c.key).trim().slice(0, 100);
    const description = (info.description ?? info.title ?? c.key)
      .replace(/<[^>]*>/g, "")
      .trim()
      .slice(0, 500);
    const baseUrl = extractBaseUrl(spec);
    const authType = extractAuthType(spec);
    const specTags = (spec.tags ?? [])
      .map((t: any) => t.name?.toLowerCase())
      .filter(Boolean);
    const tags: string[] =
      specTags.length > 0
        ? specTags.slice(0, 5)
        : [c.key.split(".")[0].toLowerCase()];
    const category =
      c.indexCategories.map((cat) => CATEGORY_MAP[cat]).find(Boolean) ??
      "Developer";
    const id = toSlug(c.key.replace(":", "-"));
    const docsUrl = baseUrl || c.swaggerUrl;

    try {
      const result = await addApi({
        id,
        name,
        description,
        category,
        authType,
        baseUrl,
        docsUrl,
        tags,
        endpoints,
      });

      if (!result.ok) {
        invalid++;
        return;
      }

      imported++;
      const domain = c.key.split(":")[0];
      importedDomains.set(domain, (importedDomains.get(domain) ?? 0) + 1);
      process.stdout.write(
        `  ✓ [${imported}/${IMPORT_TARGET}] ${c.key} (${endpoints.length} ep)\n`,
      );
    } catch {
      fetchErrors++;
    }
  }

  for (
    let i = 0;
    i < candidates.length && imported < IMPORT_TARGET;
    i += FETCH_CONCURRENCY
  ) {
    await Promise.all(
      candidates.slice(i, i + FETCH_CONCURRENCY).map(processCandidate),
    );
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const sorted = [...importedDomains.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );
  console.log(
    `\n  ✅ ${imported} APIs from ${importedDomains.size} unique domains` +
      ` (${fetchErrors} errors, ${tooFew} skipped < 3 ep, ${invalid} failed validation)\n`,
  );
  console.log("  Domain breakdown:");
  for (const [domain, count] of sorted) {
    console.log(`    ${count}x  ${domain}`);
  }
}

async function main() {
  console.log("🚀 Starting seed...\n");

  // Seed hand-picked APIs with full endpoint data — one JSON file per API
  // under prisma/apis/, so adding a new one is just dropping in a file.
  console.log("📌 Seeding curated APIs with endpoint data...");
  const apisDir = path.join(__dirname, "apis");
  const apiFiles = (await fs.readdir(apisDir)).filter((f) => f.endsWith(".json"));

  const hardcodedIds = new Set<string>();
  for (const file of apiFiles) {
    const raw = JSON.parse(await fs.readFile(path.join(apisDir, file), "utf8"));
    const result = await addApi(raw);
    if (!result.ok) {
      console.error(`  ✗ ${file}: ${result.errors.join("; ")}`);
      continue;
    }
    hardcodedIds.add(result.api.id);
    console.log(`  ✓ ${result.api.name}`);
  }

  // Reset: remove all non-hardcoded APIs before re-importing
  console.log("\n🗑️  Clearing old external APIs...");
  const deleted = await prisma.api.deleteMany({
    where: { id: { notIn: Array.from(hardcodedIds) } },
  });
  console.log(`  Removed ${deleted.count} entries`);

  // Seed from curated verified JSON list
  console.log("\n📥 Seeding curated verified APIs...");
  const { apis: curatedApis } = await import("./curated-apis.json", {
    with: { type: "json" },
  });

  let added = 0;
  let skipped = 0;
  for (const entry of curatedApis as Array<{
    name: string;
    category: string;
    description: string;
    endpoint: string;
    method: string;
  }>) {
    const id = toSlug(entry.name);
    if (hardcodedIds.has(id)) {
      skipped++;
      continue;
    }

    const url = new URL(entry.endpoint);
    const baseUrl = url.origin;
    const path = url.pathname + url.search;

    const result = await addApi({
      id,
      name: entry.name,
      description: entry.description,
      category: entry.category,
      authType: "none",
      baseUrl,
      docsUrl: entry.endpoint,
      tags: [entry.category.toLowerCase()],
      endpoints: [{ path, method: entry.method as any, summary: entry.description }],
    });

    if (!result.ok) {
      console.error(`  ✗ ${entry.name}: ${result.errors.join("; ")}`);
      skipped++;
      continue;
    }
    added++;
  }

  console.log(`  ✓ ${added} APIs imported, ${skipped} skipped`);

  await seedFromApisGuru();
}

main()
  .then(async () => {
    console.log("\n✅ Seeding complete.");
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error("❌ Seeding failed:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
