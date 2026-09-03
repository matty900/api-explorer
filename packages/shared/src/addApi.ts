// validates and writes new API entries into the Prisma-backed catalog
// (whether they come from hand-picked entries,
// the APIs.guru import, or community submissions)

import { prisma } from "./db";
import type { ApiEndpoint, ApiEntry, ApiParam, AuthType } from "./types";

const AUTH_TYPES = new Set<AuthType>([
  "none",
  "apiKey",
  "oauth2",
  "bearer",
  "basic",
]);
const METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);
const PARAM_LOCATIONS = new Set([
  "query",
  "header",
  "path",
  "body",
  "formData",
]);
const VALID_ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const MAX_ENDPOINTS = 50;
const MAX_PARAMS_PER_ENDPOINT = 15;
const MAX_TAGS = 15;

// 50-character limit on category, 100-character limit on name, 500-character...
export function toSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** What a caller submits — `id` is optional and derived from `name` (via slug) when omitted. */
export type ApiInput = Omit<ApiEntry, "id"> & { id?: string };

export type AddApiResult =
  | { ok: true; api: ApiEntry; created: boolean }
  | { ok: false; errors: string[] };

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function isValidHttpUrl(v: unknown): v is string {
  if (!isNonEmptyString(v)) return false;
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function validateParam(raw: unknown): ApiParam | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const p = raw as Record<string, unknown>;

  if (!isNonEmptyString(p.name)) return undefined;
  if (!isNonEmptyString(p.in) || !PARAM_LOCATIONS.has(p.in as string))
    return undefined;

  return {
    name: p.name.slice(0, 100),
    in: p.in as ApiParam["in"],
    required: Boolean(p.required),
    description: isNonEmptyString(p.description)
      ? p.description.slice(0, 200)
      : "",
    example: isNonEmptyString(p.example) ? p.example.slice(0, 200) : undefined,
  };
}

function validateEndpoint(
  raw: unknown,
  path: string,
  errors: string[],
): ApiEndpoint | undefined {
  if (typeof raw !== "object" || raw === null) {
    errors.push(`${path}: must be an object`);
    return undefined;
  }
  const e = raw as Record<string, unknown>;

  if (!isNonEmptyString(e.path) || !e.path.startsWith("/")) {
    errors.push(`${path}.path: must be a non-empty string starting with "/"`);
  }
  const method = isNonEmptyString(e.method) ? e.method.toUpperCase() : "";
  if (!METHODS.has(method)) {
    errors.push(`${path}.method: must be one of ${[...METHODS].join(", ")}`);
  }
  if (!isNonEmptyString(e.summary)) {
    errors.push(`${path}.summary: required non-empty string`);
  }

  let params: ApiParam[] | undefined;
  if (e.params !== undefined) {
    if (!Array.isArray(e.params)) {
      errors.push(`${path}.params: must be an array`);
    } else {
      if (e.params.length > MAX_PARAMS_PER_ENDPOINT) {
        errors.push(
          `${path}.params: at most ${MAX_PARAMS_PER_ENDPOINT} params allowed`,
        );
      }
      params = e.params
        .slice(0, MAX_PARAMS_PER_ENDPOINT)
        .map((p) => validateParam(p))
        .filter((p): p is ApiParam => p !== undefined);
    }
  }

  return {
    path: isNonEmptyString(e.path) ? e.path : "",
    method: (METHODS.has(method) ? method : "GET") as ApiEndpoint["method"],
    summary: isNonEmptyString(e.summary) ? e.summary.slice(0, 150) : "",
    params,
  };
}

// Validates a community submission or other API input, returning either a
// normalized ApiInput or a list of validation errors. Does not touch the DB.

export function validateApiSubmission(
  input: unknown,
): { ok: true; value: ApiInput } | { ok: false; errors: string[] } {
  const errors: string[] = [];

  if (typeof input !== "object" || input === null) {
    return { ok: false, errors: ["submission must be an object"] };
  }
  const raw = input as Record<string, unknown>;

  if (
    raw.id !== undefined &&
    (!isNonEmptyString(raw.id) || !VALID_ID_RE.test(raw.id))
  ) {
    errors.push(
      'id: must be a lowercase, hyphen-separated slug (e.g. "my-api")',
    );
  }
  if (!isNonEmptyString(raw.name))
    errors.push("name: required non-empty string");
  if (!isNonEmptyString(raw.description))
    errors.push("description: required non-empty string");
  if (!isNonEmptyString(raw.category))
    errors.push("category: required non-empty string");
  if (
    !isNonEmptyString(raw.authType) ||
    !AUTH_TYPES.has(raw.authType as AuthType)
  ) {
    errors.push(`authType: must be one of ${[...AUTH_TYPES].join(", ")}`);
  }
  if (!isValidHttpUrl(raw.baseUrl))
    errors.push("baseUrl: must be a valid http(s) URL");
  if (!isValidHttpUrl(raw.docsUrl))
    errors.push("docsUrl: must be a valid http(s) URL");

  let tags: string[] = [];
  if (raw.tags !== undefined) {
    if (
      !Array.isArray(raw.tags) ||
      raw.tags.some((t) => !isNonEmptyString(t))
    ) {
      errors.push("tags: must be an array of non-empty strings");
    } else {
      tags = raw.tags
        .slice(0, MAX_TAGS)
        .map((t) => (t as string).toLowerCase().trim().slice(0, 30));
    }
  }

  let endpoints: ApiEndpoint[] = [];
  if (!Array.isArray(raw.endpoints) || raw.endpoints.length === 0) {
    errors.push("endpoints: must be a non-empty array");
  } else {
    if (raw.endpoints.length > MAX_ENDPOINTS) {
      errors.push(`endpoints: at most ${MAX_ENDPOINTS} endpoints allowed`);
    }
    endpoints = raw.endpoints
      .slice(0, MAX_ENDPOINTS)
      .map((e, i) => validateEndpoint(e, `endpoints[${i}]`, errors))
      .filter((e): e is ApiEndpoint => e !== undefined);
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      id: raw.id as string | undefined,
      name: (raw.name as string).trim().slice(0, 100),
      description: (raw.description as string).trim().slice(0, 500),
      category: (raw.category as string).trim().slice(0, 50),
      authType: raw.authType as AuthType,
      baseUrl: raw.baseUrl as string,
      docsUrl: raw.docsUrl as string,
      tags,
      endpoints,
    },
  };
}

/**
 * Validates and upserts a single API into the catalog, keyed by `id` (or a
 * slug derived from `name`). This is the only path that writes to the `Api`
 * table hardcoded entries, the apis.guru import, and community submissions
 * all funnel through here.
 */
export async function addApi(input: unknown): Promise<AddApiResult> {
  const validation = validateApiSubmission(input);
  if (!validation.ok) return { ok: false, errors: validation.errors };

  const entry = validation.value;
  const id = entry.id ?? toSlug(entry.name);
  if (!id || !VALID_ID_RE.test(id)) {
    return { ok: false, errors: ["could not derive a valid id from name"] };
  }

  const existing = await prisma.api.findUnique({
    where: { id },
    select: { id: true },
  });

  const data = {
    name: entry.name,
    description: entry.description,
    category: entry.category,
    authType: entry.authType,
    baseUrl: entry.baseUrl,
    docsUrl: entry.docsUrl,
    tags: entry.tags,
    endpoints: entry.endpoints as any,
  };

  const api = await prisma.api.upsert({
    where: { id },
    update: data,
    create: { id, ...data },
  });

  // compute and store the semantic search vector. A failure here
  // like the model download is blocked must not stop the API being catalogued
  // Imported lazily so callers that only need validateApiSubmission (the
  // untrusted fork CI check) never pull in the embedding model.
  try {
    const { apiEmbeddingText, embed, toVectorLiteral } =
      await import("./embed");
    const vec = await embed(apiEmbeddingText(entry));
    await prisma.$executeRaw`
      UPDATE "Api" SET embedding = ${toVectorLiteral(vec)}::vector WHERE id = ${id}`;
  } catch (err) {
    console.warn(
      `  ⚠️  embedding skipped for ${id}: ${(err as Error).message}`,
    );
  }

  return { ok: true, api: api as unknown as ApiEntry, created: !existing };
}
