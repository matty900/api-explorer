import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@repo/shared";
import type { ApiEntry } from "@repo/shared";
import { embed, toVectorLiteral } from "@repo/shared/embed";

type Mode = "auto" | "keyword" | "semantic";

const RESULT_LIMIT = 50;
const SEMANTIC_MAX_DISTANCE = 0.75; // cosine distance: 0 = identical, ~1 = unrelated
const RRF_K = 60; // standard RRF dampening constant

const API_COLUMNS = `id, name, description, category, "authType", "baseUrl",
  "docsUrl", tags, endpoints`;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() || "";
  const category = searchParams.get("category")?.trim() || "";
  const modeParam = (searchParams.get("mode")?.trim() || "auto") as Mode;

  const categoryFilter =
    category && category !== "All" ? { category } : undefined;

  // Determine the search mode based on the query length and the provided mode parameter
  const wordCount = q.split(/\s+/).filter(Boolean).length;
  const mode: Mode =
    modeParam === "keyword" || modeParam === "semantic"
      ? modeParam
      : wordCount >= 3
        ? "auto"
        : "keyword";

  try {
    // If no query, return all APIs in the category (or all categories if none
    if (!q) {
      const apis = await prisma.api.findMany({
        where: { ...categoryFilter },
        orderBy: { name: "asc" },
        take: RESULT_LIMIT,
      });
      return NextResponse.json({ apis, mode: "keyword" });
    }

    // If the embedding model is unavailable (can't be loaded in the deploy environment), fall back to keyword

    let semanticFailed = false;
    const [keyword, semantic] = await Promise.all([
      keywordSearch(q, categoryFilter),
      mode === "keyword"
        ? Promise.resolve<ApiEntry[]>([])
        : semanticSearch(q, category).catch((err) => {
            console.error("semantic search unavailable:", err);
            semanticFailed = true;
            return [] as ApiEntry[];
          }),
    ]);

    const effectiveMode: Mode = semanticFailed ? "keyword" : mode;
    const apis =
      effectiveMode === "keyword"
        ? keyword
        : effectiveMode === "semantic"
          ? semantic
          : fuse(keyword, semantic);

    return NextResponse.json({
      apis,
      mode: effectiveMode,
      ...(semanticFailed ? { degraded: true } : {}),
    });
  } catch (err) {
    console.error("search failed:", err);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}

function keywordSearch(
  q: string,
  categoryFilter: { category: string } | undefined,
): Promise<ApiEntry[]> {
  return prisma.api.findMany({
    where: {
      ...categoryFilter,
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
        { tags: { has: q.toLowerCase() } },
      ],
    },
    orderBy: { name: "asc" },
    take: RESULT_LIMIT,
  }) as unknown as Promise<ApiEntry[]>;
}

async function semanticSearch(
  q: string,
  category: string,
): Promise<ApiEntry[]> {
  const vec = toVectorLiteral(await embed(q));
  const cat = category && category !== "All" ? category : null;

  // `<=>` measures how close two vectors are (cosine distance). The HNSW
  // index makes this fast even with many rows. The category filter is
  // written as `$3::text IS NULL OR category = $3` so the query works
  // the same whether or not a category is given — no need to build
  // different SQL strings for each case.

  return prisma.$queryRawUnsafe<ApiEntry[]>(
    `SELECT ${API_COLUMNS}
       FROM "Api"
      WHERE embedding IS NOT NULL
        AND (embedding <=> $1::vector) < $2
        AND ($3::text IS NULL OR category = $3)
      ORDER BY embedding <=> $1::vector
      LIMIT $4`,
    vec,
    SEMANTIC_MAX_DISTANCE,
    cat,
    RESULT_LIMIT,
  );
}

// RRF : Reciprocal Rank Fusion
// Combines two ranked lists into one, using each item's position (rank)
// rather than its score, since keyword and semantic results aren't scored
// the same way. An item ranks higher if it's near the top of either list,
// or appears in both. Keyword results are added first, so exact name
// matches win when scores tie

function fuse(keyword: ApiEntry[], semantic: ApiEntry[]): ApiEntry[] {
  const score = new Map<string, number>();
  const byId = new Map<string, ApiEntry>();

  const add = (list: ApiEntry[]) => {
    list.forEach((api, rank) => {
      score.set(api.id, (score.get(api.id) ?? 0) + 1 / (RRF_K + rank));
      if (!byId.has(api.id)) byId.set(api.id, api);
    });
  };
  add(keyword);
  add(semantic);

  return [...byId.values()]
    .sort((a, b) => (score.get(b.id) ?? 0) - (score.get(a.id) ?? 0))
    .slice(0, RESULT_LIMIT);
}
