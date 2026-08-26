import * as vscode from "vscode";

const DEFAULT_BACKEND_URL = "https://api-explorer-backend-rust.vercel.app";

// Read fresh on every call (not cached at module load) so a settings change
// takes effect without reloading the extension.
export function getBackendUrl(): string {
  const configured = vscode.workspace
    .getConfiguration("apiExplorer")
    .get<string>("backendUrl", DEFAULT_BACKEND_URL);
  return (configured || DEFAULT_BACKEND_URL).replace(/\/+$/, "");
}
