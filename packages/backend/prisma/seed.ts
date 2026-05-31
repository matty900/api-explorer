import "dotenv/config";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const connectionString = `${process.env.DATABASE_URL}`;

if (!connectionString || connectionString === "undefined") {
  console.error("❌ ERROR: DATABASE_URL is missing.");
  process.exit(1);
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
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
      await prisma.api.upsert({
        where: { id },
        update: {
          name,
          description,
          category,
          authType,
          baseUrl,
          docsUrl,
          tags,
          endpoints: endpoints as any,
        },
        create: {
          id,
          name,
          description,
          category,
          authType,
          baseUrl,
          docsUrl,
          tags,
          endpoints: endpoints as any,
        },
      });
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
      ` (${fetchErrors} errors, ${tooFew} skipped < 3 ep)\n`,
  );
  console.log("  Domain breakdown:");
  for (const [domain, count] of sorted) {
    console.log(`    ${count}x  ${domain}`);
  }
}
// ── Hardcoded APIs with full endpoint data ─────────────────────────────────
const HARDCODED_APIS = [
  {
    id: "openweathermap",
    name: "OpenWeatherMap",
    description:
      "Current weather, forecasts, and historical data for any location worldwide.",
    category: "Weather",
    authType: "apiKey",
    baseUrl: "https://api.openweathermap.org/data/2.5",
    docsUrl: "https://openweathermap.org/api",
    tags: ["weather", "forecast", "temperature"],
    endpoints: [
      {
        path: "/weather",
        method: "GET",
        summary: "Current weather by city",
        params: [
          {
            name: "q",
            in: "query",
            required: true,
            description: "City name",
            example: "London",
          },
          {
            name: "appid",
            in: "query",
            required: true,
            description: "Your API key",
            example: "your_key",
          },
        ],
      },
      {
        path: "/forecast",
        method: "GET",
        summary: "5-day forecast",
        params: [
          {
            name: "q",
            in: "query",
            required: true,
            description: "City name",
            example: "Tokyo",
          },
        ],
      },
    ],
  },
  {
    id: "dog-api",
    name: "The Dog API",
    description:
      "Random dog images, breeds, and sub-breeds. No auth needed — great for testing.",
    category: "Animals",
    authType: "none",
    baseUrl: "https://dog.ceo/api",
    docsUrl: "https://dog.ceo/dog-api",
    tags: ["dogs", "images", "fun"],
    endpoints: [
      {
        path: "/breeds/image/random",
        method: "GET",
        summary: "Random dog image",
      },
      { path: "/breeds/list/all", method: "GET", summary: "List all breeds" },
    ],
  },
  {
    id: "coingecko",
    name: "CoinGecko",
    description:
      "Cryptocurrency prices, market caps, and trading volume. No auth needed.",
    category: "Finance",
    authType: "none",
    baseUrl: "https://api.coingecko.com/api/v3",
    docsUrl: "https://www.coingecko.com/api/documentation",
    tags: ["crypto", "bitcoin", "prices"],
    endpoints: [
      {
        path: "/simple/price",
        method: "GET",
        summary: "Get current crypto prices",
        params: [
          {
            name: "ids",
            in: "query",
            required: true,
            description: "Coin IDs",
            example: "bitcoin,ethereum",
          },
          {
            name: "vs_currencies",
            in: "query",
            required: true,
            description: "Target currency",
            example: "usd",
          },
        ],
      },
      {
        path: "/coins/markets",
        method: "GET",
        summary: "List coins with market data",
        params: [
          {
            name: "vs_currency",
            in: "query",
            required: true,
            description: "Target currency",
            example: "usd",
          },
        ],
      },
    ],
  },
  {
    id: "rawg",
    name: "RAWG",
    description: "The largest video game database with over 500,000 games.",
    category: "Gaming",
    authType: "apiKey",
    baseUrl: "https://api.rawg.io/api",
    docsUrl: "https://rawg.io/apidocs",
    tags: ["games", "gaming", "metacritic"],
    endpoints: [
      {
        path: "/games",
        method: "GET",
        summary: "List and search games",
        params: [
          {
            name: "key",
            in: "query",
            required: true,
            description: "API key",
            example: "your_key",
          },
          {
            name: "search",
            in: "query",
            required: false,
            description: "Search term",
            example: "minecraft",
          },
        ],
      },
    ],
  },
  {
    id: "newsapi",
    name: "NewsAPI",
    description: "Search worldwide news articles from 150,000+ sources.",
    category: "News",
    authType: "apiKey",
    baseUrl: "https://newsapi.org/v2",
    docsUrl: "https://newsapi.org/docs",
    tags: ["news", "articles", "media"],
    endpoints: [
      {
        path: "/top-headlines",
        method: "GET",
        summary: "Top headlines by country",
        params: [
          {
            name: "apiKey",
            in: "query",
            required: true,
            description: "Your API key",
            example: "your_key",
          },
          {
            name: "country",
            in: "query",
            required: false,
            description: "Country code",
            example: "us",
          },
        ],
      },
      {
        path: "/everything",
        method: "GET",
        summary: "Search all articles",
        params: [
          {
            name: "q",
            in: "query",
            required: true,
            description: "Search term",
            example: "technology",
          },
        ],
      },
    ],
  },
  {
    id: "rest-countries",
    name: "REST Countries",
    description:
      "Info about countries — population, languages, currencies, borders.",
    category: "Geography",
    authType: "none",
    baseUrl: "https://restcountries.com/v3.1",
    docsUrl: "https://restcountries.com",
    tags: ["countries", "geography", "world"],
    endpoints: [
      { path: "/all", method: "GET", summary: "Get all countries" },
      {
        path: "/name/{name}",
        method: "GET",
        summary: "Search by country name",
        params: [
          {
            name: "name",
            in: "path",
            required: true,
            description: "Country name",
            example: "canada",
          },
        ],
      },
    ],
  },
  {
    id: "pokeapi",
    name: "PokeAPI",
    description:
      "All Pokémon data — moves, abilities, types, stats. No auth needed.",
    category: "Gaming",
    authType: "none",
    baseUrl: "https://pokeapi.co/api/v2",
    docsUrl: "https://pokeapi.co/docs/v2",
    tags: ["pokemon", "gaming", "anime"],
    endpoints: [
      {
        path: "/pokemon/{name}",
        method: "GET",
        summary: "Get Pokémon by name",
        params: [
          {
            name: "name",
            in: "path",
            required: true,
            description: "Pokémon name",
            example: "pikachu",
          },
        ],
      },
    ],
  },
  {
    id: "nasa",
    name: "NASA APIs",
    description:
      "Space data — Astronomy Picture of the Day, Mars rover photos, near-earth objects.",
    category: "Science",
    authType: "apiKey",
    baseUrl: "https://api.nasa.gov",
    docsUrl: "https://api.nasa.gov",
    tags: ["space", "nasa", "astronomy"],
    endpoints: [
      {
        path: "/planetary/apod",
        method: "GET",
        summary: "Astronomy Picture of the Day",
        params: [
          {
            name: "api_key",
            in: "query",
            required: true,
            description: "Use DEMO_KEY for testing",
            example: "DEMO_KEY",
          },
        ],
      },
    ],
  },
  {
    id: "github",
    name: "GitHub REST API",
    description: "Access GitHub repos, users, issues, and pull requests.",
    category: "Developer",
    authType: "bearer",
    baseUrl: "https://api.github.com",
    docsUrl: "https://docs.github.com/rest",
    tags: ["git", "code", "repos"],
    endpoints: [
      {
        path: "/users/{username}",
        method: "GET",
        summary: "Get user profile",
        params: [
          {
            name: "username",
            in: "path",
            required: true,
            description: "GitHub username",
            example: "torvalds",
          },
        ],
      },
      {
        path: "/search/repositories",
        method: "GET",
        summary: "Search repositories",
        params: [
          {
            name: "q",
            in: "query",
            required: true,
            description: "Search query",
            example: "next.js",
          },
        ],
      },
    ],
  },
  {
    id: "jsonplaceholder",
    name: "JSONPlaceholder",
    description:
      "Fake REST API for testing — posts, comments, users, todos. No auth needed.",
    category: "Tools",
    authType: "none",
    baseUrl: "https://jsonplaceholder.typicode.com",
    docsUrl: "https://jsonplaceholder.typicode.com/guide",
    tags: ["testing", "mock", "fake"],
    endpoints: [
      { path: "/posts", method: "GET", summary: "Get all posts" },
      { path: "/posts", method: "POST", summary: "Create a post" },
      {
        path: "/users/{id}",
        method: "GET",
        summary: "Get user by ID",
        params: [
          {
            name: "id",
            in: "path",
            required: true,
            description: "User ID",
            example: "1",
          },
        ],
      },
    ],
  },
  {
    id: "open-library",
    name: "Open Library",
    description: "Books, authors, and editions from the Internet Archive.",
    category: "Books",
    authType: "none",
    baseUrl: "https://openlibrary.org",
    docsUrl: "https://openlibrary.org/developers/api",
    tags: ["books", "reading", "library"],
    endpoints: [
      {
        path: "/search.json",
        method: "GET",
        summary: "Search books",
        params: [
          {
            name: "q",
            in: "query",
            required: true,
            description: "Search query",
            example: "the lord of the rings",
          },
        ],
      },
    ],
  },
  {
    id: "ip-api",
    name: "IP Geolocation",
    description: "Geolocate any IP address — country, city, timezone, ISP.",
    category: "Tools",
    authType: "none",
    baseUrl: "https://ipapi.co",
    docsUrl: "https://ipapi.co/api",
    tags: ["ip", "geolocation", "network"],
    endpoints: [
      {
        path: "/{ip}/json",
        method: "GET",
        summary: "Get location for IP",
        params: [
          {
            name: "ip",
            in: "path",
            required: true,
            description: "IP address",
            example: "8.8.8.8",
          },
        ],
      },
    ],
  },
  {
    id: "quotable",
    name: "Quotable",
    description: "Random inspirational quotes filterable by author or tag.",
    category: "Fun",
    authType: "none",
    baseUrl: "https://api.quotable.io",
    docsUrl: "https://github.com/lukePeavey/quotable",
    tags: ["quotes", "inspiration", "text"],
    endpoints: [
      { path: "/random", method: "GET", summary: "Get a random quote" },
      {
        path: "/search/quotes",
        method: "GET",
        summary: "Search quotes",
        params: [
          {
            name: "query",
            in: "query",
            required: true,
            description: "Search term",
            example: "success",
          },
        ],
      },
    ],
  },
  {
    id: "exchangerate",
    name: "ExchangeRate-API",
    description: "Real-time exchange rates for 161 currencies.",
    category: "Finance",
    authType: "apiKey",
    baseUrl: "https://v6.exchangerate-api.com/v6",
    docsUrl: "https://www.exchangerate-api.com/docs",
    tags: ["currency", "forex", "exchange"],
    endpoints: [
      {
        path: "/{apikey}/latest/{base}",
        method: "GET",
        summary: "Latest exchange rates",
        params: [
          {
            name: "apikey",
            in: "path",
            required: true,
            description: "Your API key",
            example: "your_key",
          },
          {
            name: "base",
            in: "path",
            required: true,
            description: "Base currency",
            example: "USD",
          },
        ],
      },
    ],
  },
  {
    id: "spotify",
    name: "Spotify Web API",
    description:
      "Music data — tracks, artists, albums, playlists, and audio features.",
    category: "Music",
    authType: "oauth2",
    baseUrl: "https://api.spotify.com/v1",
    docsUrl: "https://developer.spotify.com/documentation/web-api",
    tags: ["music", "streaming", "playlists"],
    endpoints: [
      {
        path: "/search",
        method: "GET",
        summary: "Search tracks, artists, albums",
        params: [
          {
            name: "q",
            in: "query",
            required: true,
            description: "Search query",
            example: "radiohead",
          },
          {
            name: "type",
            in: "query",
            required: true,
            description: "Result type",
            example: "artist",
          },
        ],
      },
    ],
  },
];

async function main() {
  console.log("🚀 Starting seed...\n");

  // Seed hardcoded APIs with full endpoint data
  console.log("📌 Seeding curated APIs with endpoint data...");
  for (const api of HARDCODED_APIS) {
    await prisma.api.upsert({
      where: { id: api.id },
      update: {
        name: api.name,
        description: api.description,
        category: api.category,
        authType: api.authType,
        baseUrl: api.baseUrl,
        docsUrl: api.docsUrl,
        tags: api.tags,
        endpoints: api.endpoints as any,
      },
      create: api as any,
    });
    console.log(`  ✓ ${api.name}`);
  }

  const hardcodedIds = new Set(HARDCODED_APIS.map((a) => a.id));

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

    await prisma.api.upsert({
      where: { id },
      update: {
        name: entry.name,
        description: entry.description,
        category: entry.category,
        authType: "none",
        baseUrl,
        docsUrl: entry.endpoint,
        tags: [entry.category.toLowerCase()],
        endpoints: [{ path, method: entry.method, summary: entry.description }],
      },
      create: {
        id,
        name: entry.name,
        description: entry.description,
        category: entry.category,
        authType: "none",
        baseUrl,
        docsUrl: entry.endpoint,
        tags: [entry.category.toLowerCase()],
        endpoints: [{ path, method: entry.method, summary: entry.description }],
      },
    });
    added++;
  }

  console.log(`  ✓ ${added} APIs imported, ${skipped} skipped`);

  await seedFromApisGuru();
}

main()
  .then(async () => {
    console.log("\n✅ Seeding complete.");
    await prisma.$disconnect();
    await pool.end();
  })
  .catch(async (e) => {
    console.error("❌ Seeding failed:", e);
    await prisma.$disconnect();
    await pool.end();
    process.exit(1);
  });
