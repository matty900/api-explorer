# API Explorer

A VS Code extension for discovering and testing public REST APIs without leaving your editor.

Search a curated catalog of 250+ APIs, browse by category or auth type, and fire live HTTP requests — all from the VS Code sidebar.

---

## Features

- **Search** APIs by name, description, or tag, or describe what you need in plain language ("something for finding songs from TV shows") and get results ranked by meaning
- **Filter** by category (Weather, Finance, Gaming, …) and auth type (Free, API Key, OAuth, Bearer)
- **Test requests** directly in VS Code with the built-in request builder
- **Copy as fetch()** to paste working code straight into your project
- Catalog seeded from hand picked APIs + [APIs.guru](https://apis.guru)

---

## Prerequisites

- Node.js 18+
- pnpm (`npm install -g pnpm`)
- PostgreSQL database with the [`pgvector`](https://github.com/pgvector/pgvector) extension available (bundled on Supabase, Neon, RDS, and the `pgvector/pgvector` Docker image)
- VS Code 1.85+

---

## Setup

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure the database

Create `packages/backend/.env`:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/api_explorer

# Optional — required only to use the /admin/submissions review dashboard
ADMIN_TOKEN=some-long-random-string

# Optional — embed search text via a hosted endpoint instead of the local
# model. Set on hosts too small for onnxruntime-node (e.g. Vercel). See
# "Deploying the backend" below.
# EMBEDDING_API_URL=
# EMBEDDING_API_KEY=
```

### 3. Sync the schema and seed the database

```bash
cd packages/backend
pnpm setup:pgvector   # installs the `vector` extension
npx prisma db push    # creates tables + the Api.embedding column
pnpm setup:pgvector   # now builds the HNSW index on that column
pnpm seed
```

The seed script imports ~15 curated APIs immediately, then fetches up to 250 more from APIs.guru in the background. Each API gets a semantic-search embedding as it's written, using a local model (`all-MiniLM-L6-v2` via Transformers.js) that downloads itself (~25 MB) on first run — no API key, no external service.

If embeddings are ever missing or stale (e.g. after changing the model), run `pnpm backfill:embeddings` to fill them in (`--all` re-embeds everything). It also re-creates the `vector` extension and HNSW index if a `prisma db push` dropped them, so it's safe to run any time the schema changes.

### 4. Start the backend

```bash
cd packages/backend
pnpm dev
```

The server runs at `http://localhost:3000`.

### 5. Build and run the extension

```bash
cd packages/extension
pnpm build
pnpm build:webview
```

Then press **F5** in VS Code to open the Extension Development Host. When launched this way the extension talks to `http://localhost:3000` automatically, so make sure `pnpm dev` (step 4) is running. Set `apiExplorer.backendUrl` only if your backend is somewhere else.

---

## Project structure

```
packages/
  backend/          Next.js server — search, categories, and proxy API routes
  extension/        VS Code extension — sidebar UI and request builder panel
  shared/           Prisma client singleton + shared TypeScript types
```

### API routes (backend)

| Route                                | Description                                                              |
| ------------------------------------ | ------------------------------------------------------------------------ |
| `GET /api/search?q=&category=&mode=` | Search the catalog. `mode` is `auto` (default), `keyword`, or `semantic` |
| `GET /api/categories`                | List top categories                                                      |
| `POST /api/proxy`                    | Relay HTTP requests to external APIs (CORS-safe)                         |
| `POST /api/submissions`              | Submit an API for review (public, rate-limited)                          |
| `GET /api/submissions?status=`       | List submissions by status (admin)                                       |
| `POST /api/submissions/:id/approve`  | Approve a submission into the catalog (admin)                            |
| `POST /api/submissions/:id/reject`   | Reject a submission (admin)                                              |

---

## How it works

1. The sidebar React app sends search queries to the Next.js backend via the VS Code extension host.
2. The backend runs two engines: a **keyword** query (name/description/tag match) and a **semantic** one (the query is embedded — locally or via a hosted endpoint, see "Deploying the backend" — and ranked against each API's stored vector with pgvector's cosine distance). In `auto` mode a short query stays keyword-only while a phrase runs both and blends the rankings with Reciprocal Rank Fusion.
3. Clicking an API opens the request builder panel.
4. Sending a request routes through the backend proxy so external APIs are reachable without CORS restrictions.

---

## Deploying the backend

The published extension points at `apiExplorer.backendUrl` (default: the hosted backend), **not** your local server — so semantic search only works once the deployed backend runs this code against a `pgvector`-enabled database with embeddings populated.

### Two embedding backends

`embed()` (`packages/shared/src/embed.ts`) has two interchangeable implementations, both producing 384-dim, mean-pooled, L2-normalized `all-MiniLM-L6-v2` vectors:

| | When | Notes |
|---|---|---|
| **local** (default) | `EMBEDDING_API_URL` unset | Runs the model in-process via `@huggingface/transformers` (an **optional** dependency). No key, no network after the one-time model download. Fine for local dev, self-hosted backends, and any host with room for `onnxruntime-node` (~200 MB installed). |
| **api** | `EMBEDDING_API_URL` set | Embeds via a hosted endpoint. For serverless hosts (Vercel) that can't fit the native runtime. Only the search *query* is embedded at request time — catalog vectors are already in the DB. |

### On Vercel (serverless)

1. `packages/backend/vercel.json` already sets the install command to `pnpm install --frozen-lockfile --no-optional` — this skips `@huggingface/transformers` + `onnxruntime-node` so the function stays small.
2. Set project env vars:
   - `EMBEDDING_API_URL` — a hosted `all-MiniLM-L6-v2` feature-extraction endpoint, e.g. Hugging Face Inference: `https://router.huggingface.co/hf-inference/models/sentence-transformers/all-MiniLM-L6-v2/pipeline/feature-extraction`
   - `EMBEDDING_API_KEY` — the endpoint's token
3. **Verify vector compatibility** before trusting it against the existing 387 vectors:
   ```bash
   EMBEDDING_API_URL=... EMBEDDING_API_KEY=... pnpm --filter backend embed:verify
   ```
   If parity fails (e.g. you chose a different model), re-embed the whole catalog once with the API backend:
   ```bash
   EMBEDDING_API_URL=... EMBEDDING_API_KEY=... pnpm --filter backend backfill:embeddings --all
   ```
   A non-384-dim model also needs `vector(384)` in `schema.prisma` and `EMBEDDING_DIM` updated, then `prisma db push`.

If the active embedder fails at request time, `/api/search` returns keyword results with `"degraded": true` rather than erroring.

### On a container / VM host (Railway, Render, Fly, …)

Nothing special — the local backend works out of the box. Set `TRANSFORMERS_CACHE` to a persistent path if the filesystem is ephemeral.

---

## Contributing an API

Two ways to add an API to the catalog , see [CONTRIBUTING.md](CONTRIBUTING.md) for details:

- **Web form** (`/submit`, or the **+** button in the extension sidebar) — no account or git needed. Submissions land as "pending" and a maintainer approves or rejects them from `/admin/submissions`.
- **GitHub pull request** — add a JSON file under `packages/backend/prisma/community-apis/`. CI validates it automatically; once merged, it's imported into the catalog without any manual seeding step.

Nothing reaches the live catalog without a maintainer review, on either path.

---

## Tech stack

- **Extension UI**: React + esbuild (compiled into a VS Code webview)
- **Backend**: Next.js 16 (App Router)
- **Database**: PostgreSQL via Prisma + `@prisma/adapter-pg`, with `pgvector` for semantic search
- **Embeddings**: `all-MiniLM-L6-v2` running locally through `@huggingface/transformers` (no API key)
- **Monorepo**: pnpm workspaces
