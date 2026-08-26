# API Explorer

A VS Code extension for discovering and testing public REST APIs without leaving your editor.

Search a curated catalog of 250+ APIs, browse by category or auth type, and fire live HTTP requests — all from the VS Code sidebar.

---

## Features

- **Search** APIs by name, description, or tag
- **Filter** by category (Weather, Finance, Gaming, …) and auth type (Free, API Key, OAuth, Bearer)
- **Test requests** directly in VS Code with the built-in request builder
- **Copy as fetch()** to paste working code straight into your project
- Catalog seeded from hand picked APIs + [APIs.guru](https://apis.guru)

---

## Prerequisites

- Node.js 18+
- pnpm (`npm install -g pnpm`)
- PostgreSQL database
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
```

### 3. Sync the schema and seed the database

```bash
cd packages/backend
npx prisma db push
pnpm seed
```

The seed script imports ~15 curated APIs immediately, then fetches up to 250 more from APIs.guru in the background.

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

Then press **F5** in VS Code to open the Extension Development Host, or install the packaged `.vsix` file.

---

## Project structure

```
packages/
  backend/          Next.js server — search, categories, and proxy API routes
  extension/        VS Code extension — sidebar UI and request builder panel
  shared/           Prisma client singleton + shared TypeScript types
```

### API routes (backend)

| Route                               | Description                                      |
| ----------------------------------- | ------------------------------------------------ |
| `GET /api/search?q=&category=`      | Search the API catalog                           |
| `GET /api/categories`               | List top categories                              |
| `POST /api/proxy`                   | Relay HTTP requests to external APIs (CORS-safe) |
| `POST /api/submissions`             | Submit an API for review (public, rate-limited)  |
| `GET /api/submissions?status=`      | List submissions by status (admin)               |
| `POST /api/submissions/:id/approve` | Approve a submission into the catalog (admin)    |
| `POST /api/submissions/:id/reject`  | Reject a submission (admin)                      |

---

## How it works

1. The sidebar React app sends search queries to the Next.js backend via the VS Code extension host.
2. The backend queries Postgres and returns matching APIs.
3. Clicking an API opens the request builder panel.
4. Sending a request routes through the backend proxy so external APIs are reachable without CORS restrictions.

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
- **Database**: PostgreSQL via Prisma + `@prisma/adapter-pg`
- **Monorepo**: pnpm workspaces
