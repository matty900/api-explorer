// This file contains the implementation of the VS Code extension for the API Explorer.
import * as vscode from "vscode";
import { SidebarProvider } from "./sidebar";
import { RequestBuilderPanel } from "./requestBuilder";

export function activate(context: vscode.ExtensionContext) {
  // pass the extension URI to the sidebar provider so it can load local resources
  const sidebarProvider = new SidebarProvider(context.extensionUri);

  // Connects the custom code (sidebarProvider) to the specific UI location ("api-explorer.sidebar")
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      "api-explorer.sidebar",
      sidebarProvider,
    ),
  );
  // Register the command that opens the request builder panel when an API is clicked in the sidebar
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "api-explorer.openRequestBuilder",
      (api: unknown) => {
        RequestBuilderPanel.createOrShow(api);
      },
    ),
  );
}

export function deactivate() {}
