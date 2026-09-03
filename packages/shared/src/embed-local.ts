// Local Transformers.js backend for embed.ts — runs all-MiniLM-L6-v2 in
// process, no API key, no network after the one-time model download (~25 MB
// into the Hugging Face cache; set TRANSFORMERS_CACHE on read-only hosts).
//
// `@huggingface/transformers` is an OPTIONAL dependency: hosted-API deploys
// (Vercel with EMBEDDING_API_URL set) install with `--no-optional` and never
// load this file. So the package is pulled in only via a guarded dynamic
// import, and its types are declared locally rather than imported.

type FeatureExtractor = (
  text: string,
  opts: { pooling: "mean"; normalize: boolean },
) => Promise<{ data: Float32Array | number[] }>;

interface TransformersModule {
  env: { cacheDir?: string };
  pipeline: (task: "feature-extraction", model: string) => Promise<FeatureExtractor>;
}

// Xenova/* is the Transformers.js-compatible conversion of the same weights
// as sentence-transformers/all-MiniLM-L6-v2.
const MODEL = "Xenova/all-MiniLM-L6-v2";

let extractorPromise: Promise<FeatureExtractor> | null = null;

async function loadExtractor(): Promise<FeatureExtractor> {
  let mod: TransformersModule;
  try {
    mod = (await import(
      // @ts-ignore optional dependency — absent on `--no-optional` (API-only) installs
      /* turbopackOptional: true */ "@huggingface/transformers"
    )) as unknown as TransformersModule;
  } catch {
    throw new Error(
      "@huggingface/transformers is not installed. Either install it (default) " +
        "or set EMBEDDING_API_URL to embed via a hosted endpoint instead.",
    );
  }
  if (process.env.TRANSFORMERS_CACHE) {
    mod.env.cacheDir = process.env.TRANSFORMERS_CACHE;
  }
  return mod.pipeline("feature-extraction", MODEL);
}

/** Embed one string. Mean-pooled; embed.ts re-normalizes. */
export async function embedLocal(text: string): Promise<number[]> {
  extractorPromise ??= loadExtractor();
  const extractor = await extractorPromise;
  const output = await extractor(text, { pooling: "mean", normalize: true });
  return Array.from(output.data as ArrayLike<number>);
}
