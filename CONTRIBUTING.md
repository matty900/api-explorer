# Contributing an API

There are two ways to add an API to the catalog, depending on who you are.

## 1. Just have an API to suggest? Use the web form

No account, no JSON, no git required.

1. Open the extension sidebar and click the **+** button (or go straight to `/submit` on the site).
2. Fill in the API's name, description, category, base URL, docs URL, and one example endpoint.
3. Submit. A maintainer reviews it and either approves it (it appears in the catalog) or rejects it.

Every submission is reviewed before anything goes live — nothing is added to the catalog automatically.

## 2. Developer? Open a pull request

This path is for adding a fully-specified entry (multiple endpoints, params, etc.) or for contributing code.

1. Fork the repo.
2. Add a new file at `packages/backend/prisma/community-apis/<your-api-id>.json` matching the schema below.
3. Open a pull request. A GitHub Action automatically validates your JSON and reports the result in the PR checks.
4. A maintainer reviews and merges. Once merged, another Action imports it into the live catalog — no manual seeding step needed.

### Submission schema

```json
{
  "id": "my-api",
  "name": "My API",
  "description": "What this API does, in a sentence or two.",
  "category": "Weather",
  "authType": "none",
  "baseUrl": "https://api.example.com",
  "docsUrl": "https://example.com/docs",
  "tags": ["weather", "forecast"],
  "endpoints": [
    {
      "path": "/forecast",
      "method": "GET",
      "summary": "5-day forecast",
      "params": [
        {
          "name": "city",
          "in": "query",
          "required": true,
          "description": "City name",
          "example": "London"
        }
      ]
    }
  ]
}
```

- `id` — optional. Lowercase, hyphen-separated (e.g. `my-api`). Derived from `name` if omitted.
- `authType` — one of `none`, `apiKey`, `oauth2`, `bearer`, `basic`.
- `baseUrl` / `docsUrl` — must be valid `http(s)` URLs.
- `endpoints` — at least one. Each `method` is one of `GET`, `POST`, `PUT`, `PATCH`, `DELETE`. `params[].in` is one of `query`, `header`, `path`, `body`, `formData`.
- `tags` — optional, up to 15.

The exact same validation (`validateApiSubmission` in `packages/shared/src/addApi.ts`) runs on both tracks, so if your JSON passes CI locally with:

```bash
pnpm --filter backend exec tsx scripts/validate-community-apis.ts
```

it will pass in CI too.

### What the review checks for

Automated checks only verify _shape_ (required fields, valid URLs, well-formed endpoints) and whether the `baseUrl` currently responds. A human still reviews every submission for things automation can't judge: is this a real, working, appropriate API for the catalog — not a duplicate, not abusive, not pointing at something it shouldn't.
