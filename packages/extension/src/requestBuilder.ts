// This file contains the implementation of the request builder panel for testing APIs in the VS Code extension.
import * as vscode from "vscode";
import { getBackendUrl } from "./config";

// generate a random nonce for Content Security Policy
function getNonce() {
  let text = "";
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

// This class manages the request builder panel that opens when clicking on an API in the sidebar
export class RequestBuilderPanel {
  public static currentPanel: RequestBuilderPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;

  public static createOrShow(api: unknown) {
    const column = vscode.ViewColumn.Beside;
    if (RequestBuilderPanel.currentPanel) {
      RequestBuilderPanel.currentPanel._panel.reveal(column);
      RequestBuilderPanel.currentPanel._update(api);
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      "api-explorer.requestBuilder",
      "Test API",
      column,
      { enableScripts: true, retainContextWhenHidden: true },
    );
    RequestBuilderPanel.currentPanel = new RequestBuilderPanel(panel, api);
  }
  // The constructor sets up the webview panel and its message listener
  private constructor(panel: vscode.WebviewPanel, api: unknown) {
    this._panel = panel;
    this._update(api);
    this._panel.onDidDispose(() => {
      RequestBuilderPanel.currentPanel = undefined;
    });
    this._panel.webview.onDidReceiveMessage(async (msg) => {
      if (msg.type === "sendRequest") {
        try {
          const res = await fetch(`${getBackendUrl()}/api/proxy`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(msg.request),
          });
          const data = await res.json();
          if (data.error) {
            this._panel.webview.postMessage({
              type: "error",
              message: data.error,
            });
          } else {
            this._panel.webview.postMessage({
              type: "response",
              response: data,
            });
          }
        } catch {
          this._panel.webview.postMessage({
            type: "error",
            message: "Request failed. Is the backend running?",
          });
        }
      }
      if (msg.type === "copyCode") {
        vscode.env.clipboard.writeText(msg.code);
        vscode.window.showInformationMessage("Code snippet copied!");
      }
    });
  }
  // The _update method updates the webview content based on the selected API
  private _update(api: unknown) {
    const a = api as {
      name: string;
      description: string;
      baseUrl: string;
      docsUrl: string;
      authType: string;
      endpoints: Array<{ path: string; method: string; summary: string }>;
    };
    this._panel.title = "Test: " + a.name;
    this._panel.webview.html = this._getHtml(a);
  }

  /* This method constructs a massive string containing the HTML, CSS, 
  and JavaScript that renders the entire testing dashboard. */
  private _getHtml(api: any): string {
    const nonce = getNonce();
    const safe = (s: string) =>
      String(s)
        .replace(/'/g, "&#39;")
        .replace(/"/g, "&quot;")
        .replace(/`/g, "&#96;");
    // generates small clickable badge buttons for quick testing
    const firstEndpoint = api.endpoints?.[0];
    const defaultUrl = firstEndpoint
      ? safe(api.baseUrl + firstEndpoint.path)
      : safe(api.baseUrl);
    const defaultMethod = firstEndpoint?.method || "GET";
    const endpointButtons = (api.endpoints || [])
      .map(
        (ep: any) =>
          '<button class="ep-btn" data-url="' +
          safe(api.baseUrl + ep.path) +
          '" data-method="' +
          safe(ep.method) +
          '">' +
          safe(ep.method) +
          " " +
          safe(ep.path) +
          "</button>",
      )
      .join("");
    // returns the full HTML content for the webview panel for testing the API, including styles and scripts for sending requests and displaying responses
    return (
      "<!DOCTYPE html>" +
      '<html lang="en"><head>' +
      '<meta charset="UTF-8">' +
      "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-" +
      nonce +
      "';\">" +
      "<style>" +
      "body{background:var(--vscode-editor-background);color:var(--vscode-foreground);font-family:var(--vscode-font-family);padding:20px;font-size:13px;}" +
      "h2{font-size:16px;font-weight:500;margin-bottom:4px;}" +
      ".meta{font-size:12px;color:var(--vscode-descriptionForeground);margin-bottom:16px;}" +
      ".meta a{color:var(--vscode-textLink-foreground);}" +
      "label{display:block;font-size:11px;font-weight:500;color:var(--vscode-descriptionForeground);text-transform:uppercase;letter-spacing:.05em;margin:14px 0 5px;}" +
      ".row{display:flex;gap:8px;align-items:center;}" +
      "input,select,textarea{background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border);border-radius:4px;padding:6px 8px;font-size:13px;font-family:inherit;width:100%;}" +
      "select{width:auto;min-width:90px;}" +
      "textarea{min-height:80px;resize:vertical;}" +
      ".row input{flex:1;}" +
      "button{background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;border-radius:4px;padding:7px 16px;font-size:13px;cursor:pointer;font-family:inherit;}" +
      ".ep-btn{font-size:11px;padding:3px 8px;background:var(--vscode-badge-background);color:var(--vscode-badge-foreground);border-radius:4px;margin-right:6px;margin-bottom:6px;}" +
      "pre{background:var(--vscode-textCodeBlock-background);border:1px solid var(--vscode-widget-border);border-radius:4px;padding:12px;font-size:12px;overflow:auto;max-height:400px;white-space:pre-wrap;word-break:break-word;}" +
      "#loading{display:none;color:var(--vscode-descriptionForeground);font-size:12px;margin-top:8px;}" +
      "#status{font-size:12px;color:var(--vscode-descriptionForeground);margin-top:8px;}" +
      "</style></head><body>" +
      "<h2>" +
      api.name +
      "</h2>" +
      '<p class="meta">' +
      api.description +
      ' &middot; <a href="' +
      api.docsUrl +
      '" target="_blank">Docs</a></p>' +
      (endpointButtons
        ? "<label>Quick endpoints</label><div>" + endpointButtons + "</div>"
        : "") +
      "<label>Method &amp; URL</label>" +
      '<div class="row">' +
      '<select id="method"><option' +
      (defaultMethod === "GET" ? " selected" : "") +
      ">GET</option><option" +
      (defaultMethod === "POST" ? " selected" : "") +
      ">POST</option><option" +
      (defaultMethod === "PUT" ? " selected" : "") +
      ">PUT</option><option" +
      (defaultMethod === "DELETE" ? " selected" : "") +
      ">DELETE</option></select>" +
      '<input id="url" type="text" value="' +
      defaultUrl +
      '" />' +
      '<button id="send-btn">Send</button>' +
      "</div>" +
      "<label>Body (JSON)</label>" +
      '<textarea id="body" placeholder=\'{ "key": "value" }\'></textarea>' +
      '<div style="margin-top:12px;display:flex;gap:8px;">' +
      '<button id="send-btn2">Send Request</button>' +
      '<button id="copy-btn" style="background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);">Copy as fetch()</button>' +
      "</div>" +
      '<p id="loading">Sending...</p>' +
      '<p id="status"></p>' +
      '<pre id="response-body"></pre>' +
      '<script nonce="' +
      nonce +
      '">' +
      "(function(){" +
      "var vscode=acquireVsCodeApi();" +
      "var lastRequest=null;" +
      "function doSend(){" +
      'var method=document.getElementById("method").value;' +
      'var url=document.getElementById("url").value;' +
      'var body=document.getElementById("body").value.trim();' +
      "lastRequest={method:method,url:url,headers:{},body:body||undefined};" +
      'document.getElementById("loading").style.display="block";' +
      'document.getElementById("response-body").textContent="";' +
      'document.getElementById("status").textContent="";' +
      'vscode.postMessage({type:"sendRequest",request:lastRequest});' +
      "}" +
      'document.getElementById("send-btn").addEventListener("click",doSend);' +
      'document.getElementById("send-btn2").addEventListener("click",doSend);' +
      'document.getElementById("copy-btn").addEventListener("click",function(){' +
      "if(!lastRequest)return;" +
      'var code="const res = await fetch(\'"+lastRequest.url+"\', {\\n  method: \'"+lastRequest.method+"\'\\n});\\nconst data = await res.json();\\nconsole.log(data);";' +
      'vscode.postMessage({type:"copyCode",code:code});' +
      "});" +
      'document.querySelectorAll(".ep-btn").forEach(function(btn){' +
      'btn.addEventListener("click",function(){' +
      'document.getElementById("url").value=btn.getAttribute("data-url");' +
      'document.getElementById("method").value=btn.getAttribute("data-method");' +
      "});" +
      "});" +
      'window.addEventListener("message",function(event){' +
      "var msg=event.data;" +
      'document.getElementById("loading").style.display="none";' +
      'if(msg.type==="response"){' +
      'try{document.getElementById("response-body").textContent=JSON.stringify(JSON.parse(msg.response.body),null,2);}' +
      'catch(e){document.getElementById("response-body").textContent=msg.response.body;}' +
      'document.getElementById("status").textContent=msg.response.status+" "+msg.response.statusText+" · "+msg.response.durationMs+"ms";' +
      "}" +
      'if(msg.type==="error"){document.getElementById("response-body").textContent=msg.message;}' +
      "});" +
      "}())" +
      "<\/script>" +
      "</body></html>"
    );
  }
}
