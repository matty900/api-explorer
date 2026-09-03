import * as vscode from "vscode";

const PROD_BACKEND_URL = "https://api-explorer-backend-rust.vercel.app";
const DEV_BACKEND_URL = "http://localhost:3000";

// Read fresh on every call (not cached at module load) so a settings change
// takes effect without reloading the extension.
//
// Resolution order:
//   1. an explicit `apiExplorer.backendUrl` setting (user or workspace)
//   2. http://localhost:3000 when running in the Extension Development Host
//      (F5), so contributors can test against a local backend with no setup
//   3. the hosted production backend
export function getBackendUrl(extensionMode?: vscode.ExtensionMode): string {
  const inspected = vscode.workspace
    .getConfiguration("apiExplorer")
    .inspect<string>("backendUrl");

  const explicit =
    inspected?.workspaceFolderValue ??
    inspected?.workspaceValue ??
    inspected?.globalValue;

  if (explicit && explicit.trim()) {
    return explicit.trim().replace(/\/+$/, "");
  }

  if (extensionMode === vscode.ExtensionMode.Development) {
    return DEV_BACKEND_URL;
  }

  return PROD_BACKEND_URL;
}

// Headers to send with every backend request. Adds the Vercel protection-bypass
// header when `apiExplorer.vercelBypassToken` is set, so the extension can talk
// to a password-protected Vercel preview deployment while testing.
export function getBackendHeaders(): Record<string, string> {
  const token = vscode.workspace
    .getConfiguration("apiExplorer")
    .get<string>("vercelBypassToken", "")
    .trim();

  if (!token) return {};
  return {
    "x-vercel-protection-bypass": token,
    "x-vercel-set-bypass-cookie": "true",
  };
}
