import * as vscode from "vscode";
import { SidebarProvider } from "./sidebar";
import { RequestBuilderPanel } from "./requestBuilder";

export function activate(context: vscode.ExtensionContext) {
  const sidebarProvider = new SidebarProvider(context.extensionUri);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      "api-explorer.sidebar",
      sidebarProvider,
    ),
  );

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
