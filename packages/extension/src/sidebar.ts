// This file contains the implementation of the sidebar provider for the VS Code extension,
// which displays categories, search results, and allows users to open the request builder for testing APIs.

// sidebar.ts is the controller/bridge (extension host side, has real system/network access
import * as vscode from "vscode";
import { getBackendHeaders, getBackendUrl } from "./config";

export class SidebarProvider implements vscode.WebviewViewProvider {
  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _extensionMode: vscode.ExtensionMode,
  ) {}

  public resolveWebviewView(webviewView: vscode.WebviewView) {
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getHtml(webviewView.webview);
    // The message listener handles messages sent from the webview (e.g., to fetch categories, perform search, or open the request builder)
    webviewView.webview.onDidReceiveMessage(async (msg) => {
      const backendUrl = getBackendUrl(this._extensionMode);
      const headers = getBackendHeaders();
      // 1. Fetch categories
      if (msg.type === "getCategories") {
        try {
          const res = await fetch(`${backendUrl}/api/categories`, { headers });
          const data = await res.json();
          webviewView.webview.postMessage({
            type: "categoriesResult",
            categories: data.categories || [],
          });
        } catch {
          webviewView.webview.postMessage({
            type: "categoriesResult",
            categories: [],
          });
        }
      }
      // 2. Perform search
      if (msg.type === "search") {
        try {
          const url = new URL(`${backendUrl}/api/search`);
          url.searchParams.set("q", msg.query ?? "");
          url.searchParams.set("category", msg.category ?? "");
          url.searchParams.set("mode", msg.mode ?? "auto");
          const res = await fetch(url.toString(), { headers });
          const data = await res.json();
          webviewView.webview.postMessage({
            type: "searchResults",
            results: data,
          });
        } catch {
          webviewView.webview.postMessage({
            type: "error",
            message: `Cannot reach backend at ${backendUrl}.`,
          });
        }
      }
      // 3. Open request builder
      if (msg.type === "openRequestBuilder") {
        vscode.commands.executeCommand(
          "api-explorer.openRequestBuilder",
          msg.api,
        );
      }
      // 4. Open the "Submit an API" web form in the user's default browser
      if (msg.type === "submitApi") {
        vscode.env.openExternal(vscode.Uri.parse(`${backendUrl}/submit`));
      }
    });
  }
  // The _getHtml method returns the HTML content for the sidebar webview, including styles and scripts for displaying categories, search results, and handling user interactions
  private _getHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "dist", "webview.js"),
    );

    const nonce = Math.random().toString(36).slice(2);

    return `<!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline';">
    <title>API Explorer</title>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body {
        background: var(--vscode-sideBar-background);
        color: var(--vscode-foreground);
        font-family: var(--vscode-font-family);
        font-size: 13px;
      }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
  </body>
  </html>`;
  }
}
