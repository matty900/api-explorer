import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Trace from the monorepo root so pnpm's linked workspace packages resolve.
  outputFileTracingRoot: path.join(__dirname, "../.."),

  // The downloaded model cache is machine-local and re-fetched at runtime when
  // the local embedding backend is used (and absent entirely on the hosted-API
  // backend) — never ship it in a function bundle.
  outputFileTracingExcludes: {
    "*": ["**/@huggingface/transformers/.cache/**"],
  },
};

export default nextConfig;
