# Change Log

All notable changes to the "API Explorer" extension will be documented in this file.

## [Unreleased]

- Semantic search: an Auto / Keyword / Smart toggle in the sidebar. "Smart" (and "Auto" for phrase-length queries) ranks the catalog by meaning, so you can describe what you need instead of guessing keywords.
- The extension automatically targets `http://localhost:3000` when run from source (F5); `apiExplorer.backendUrl` still overrides.
- New `apiExplorer.vercelBypassToken` setting to reach a protected Vercel preview deployment while testing.

## [0.0.1] - Initial release

- Search and filter a catalog of public APIs by category and auth type
- Request builder panel for sending live requests and copying `fetch()` snippets
- Submit-an-API flow (web form, reviewed before publishing)
- Configurable backend URL (`apiExplorer.backendUrl`)
