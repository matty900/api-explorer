# API Explorer

Search and test public REST APIs without leaving VS Code.

Browse a growing catalog of public APIs, filter by category or auth type, and fire real HTTP requests from a request builder panel — all inside the editor.

## Features

- **Search** APIs by name, description, or tag from the sidebar
- **Filter** by category (Weather, Finance, Gaming, …) and auth type (Free, API Key, OAuth, Bearer)
- **Test requests** live with the built-in request builder — pick an endpoint, fill in params, send it
- **Copy as fetch()** to paste working code straight into your project
- **Submit an API** — click the **+** button in the sidebar to suggest an API for the catalog; every submission is reviewed before it goes live

## Getting started

1. Open the API Explorer icon in the Activity Bar.
2. Search or browse by category.
3. Click an API to open the request builder, fill in the request, and hit Send.

## Extension Settings

This extension contributes the following setting:

- `apiExplorer.backendUrl` — base URL of the API Explorer backend. Defaults to the hosted backend; override it (e.g. `http://localhost:3000`) if you're running your own backend locally.

## Contributing

Know an API that should be in the catalog? Use the **+** button in the sidebar, or see [CONTRIBUTING.md](https://github.com/matty900/api-explorer/blob/main/CONTRIBUTING.md) to add one via pull request.

## Privacy

Search and category requests, and any API request you send through the request builder, are relayed through the API Explorer backend (see `apiExplorer.backendUrl`). No request data is stored beyond what's needed to serve the response.
