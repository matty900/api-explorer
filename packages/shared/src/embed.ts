// Pluggable text embedding — all-MiniLM-L6-v2, 384-dim, mean-pooled and
// L2-normalized. Two interchangeable backends:
//
//   local (default)  — the model runs in-process via Transformers.js. No API
//                      key, no network. Used for local dev, seeding, and any
//                      backend host with room for onnxruntime-node.
//   api              — when EMBEDDING_API_URL is set, text is embedded by a
//                      hosted endpoint instead. For size-constrained deploys
//                      (e.g. Vercel serverless) where the ~200 MB native
//                      runtime can't be bundled.
//
// The endpoint MUST serve the same model with mean pooling. Normalization is
// redone here so the two backends agree regardless of the endpoint's own
// behaviour — but still run `pnpm --filter backend embed:verify` before
// trusting the API against vectors written by a different backend. If they
// don't match, `pnpm --filter backend backfill:embeddings --all` re-embeds
// the whole catalog with the active backend.

export const EMBEDDING_MODEL = "sentence-transformers/all-MiniLM-L6-v2";
export const EMBEDDING_DIM = 384;

const API_URL = process.env.EMBEDDING_API_URL;
const API_KEY = process.env.EMBEDDING_API_KEY;

export function embeddingBackend(): "api" | "local" {
  return API_URL ? "api" : "local";
}

function l2normalize(v: number[]): number[] {
  let norm = 0;
  for (const x of v) norm += x * x;
  norm = Math.sqrt(norm) || 1;
  return v.map((x) => x / norm);
}

/** Embed a single string into a 384-dim unit vector, using the active backend. */
export async function embed(text: string): Promise<number[]> {
  return embedWith(embeddingBackend(), text);
}

/**
 * Embed with a specific backend regardless of configuration. Used by
 * `embed:verify` to compare the hosted endpoint against the local model.
 */
export async function embedWith(
  backend: "api" | "local",
  text: string,
): Promise<number[]> {
  const input = text.slice(0, 4000);
  const raw =
    backend === "api" ? await embedViaApi(input) : await embedLocally(input);
  if (raw.length !== EMBEDDING_DIM) {
    throw new Error(
      `${backend} embedding backend returned ${raw.length} dims, expected ${EMBEDDING_DIM}`,
    );
  }
  return l2normalize(raw);
}

async function embedLocally(text: string): Promise<number[]> {
  // Loaded lazily: nothing touches @huggingface/transformers (or its native
  // onnxruntime-node dependency) until the local backend is actually used —
  // API-backed deploys never pay for it.
  const { embedLocal } = await import("./embed-local");
  return embedLocal(text);
}

async function embedViaApi(text: string): Promise<number[]> {
  const res = await fetch(API_URL as string, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}),
    },
    body: JSON.stringify({ inputs: text }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`embedding API ${res.status}: ${body.slice(0, 200)}`);
  }
  const data: unknown = await res.json();
  const vec = extractVector(data);
  if (!vec) throw new Error("embedding API: unrecognized response shape");
  return vec;
}

// Find a 384-length float array in whatever the endpoint returned. Handles:
//   [0.1, ...]                              HF feature-extraction (single)
//   [[0.1, ...]]                            HF / batch-of-one
//   { embedding: [...] } / { embeddings: [[...]] }
//   { data: [{ embedding: [...] }] }        OpenAI-style
//   { result: { data: [[...]] } }           Cloudflare Workers AI
function extractVector(data: unknown): number[] | null {
  const isFloatArray = (v: unknown): v is number[] =>
    Array.isArray(v) && typeof v[0] === "number";

  const seen = new Set<unknown>();
  const walk = (node: unknown, depth: number): number[] | null => {
    if (depth > 6 || node == null || seen.has(node)) return null;
    if (isFloatArray(node)) return node;
    if (Array.isArray(node)) {
      seen.add(node);
      for (const item of node) {
        const hit = walk(item, depth + 1);
        if (hit) return hit;
      }
      return null;
    }
    if (typeof node === "object") {
      seen.add(node);
      const o = node as Record<string, unknown>;
      for (const key of ["embedding", "embeddings", "data", "result", "vector"]) {
        if (key in o) {
          const hit = walk(o[key], depth + 1);
          if (hit) return hit;
        }
      }
    }
    return null;
  };

  return walk(data, 0);
}

/**
 * The text we embed for a catalog entry — the concatenation of everything a
 * user might describe when looking for it. Keep this in sync between the
 * write path (addApi) and any backfill so vectors stay comparable.
 */
export function apiEmbeddingText(api: {
  name: string;
  description: string;
  category: string;
  tags: string[];
}): string {
  return [api.name, api.category, api.tags.join(", "), api.description]
    .filter(Boolean)
    .join(". ");
}

/** pgvector's literal form for a vector: "[0.1,0.2,...]". */
export function toVectorLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}
