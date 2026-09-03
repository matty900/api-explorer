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

type StoredAuth =
  | { authType: "apiKey" | "bearer" | "oauth2"; value: string }
  | { authType: "basic"; username: string; password: string };

// This class manages the request builder panel that opens when clicking on an API in the sidebar
export class RequestBuilderPanel {
  public static currentPanel: RequestBuilderPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _context: vscode.ExtensionContext;
  private _api: any;

  public static createOrShow(context: vscode.ExtensionContext, api: unknown) {
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
    RequestBuilderPanel.currentPanel = new RequestBuilderPanel(
      panel,
      context,
      api,
    );
  }
  // The constructor sets up the webview panel and its message listener
  private constructor(
    panel: vscode.WebviewPanel,
    context: vscode.ExtensionContext,
    api: unknown,
  ) {
    this._panel = panel;
    this._context = context;
    this._update(api);
    this._panel.onDidDispose(() => {
      RequestBuilderPanel.currentPanel = undefined;
    });
    this._panel.webview.onDidReceiveMessage(async (msg) => {
      if (msg.type === "sendRequest") {
        try {
          const res = await fetch(
            `${getBackendUrl(this._context.extensionMode)}/api/proxy`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(msg.request),
            },
          );
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
      // The webview signals "ready" once its script has attached its message
      // listener, so we don't lose an authSecret message posted too early.
      if (msg.type === "ready") {
        await this._sendSavedAuth();
      }
      if (msg.type === "saveAuth" && msg.apiId && msg.auth) {
        await this._context.secrets.store(
          this._authKey(msg.apiId),
          JSON.stringify(msg.auth as StoredAuth),
        );
      }
      if (msg.type === "deleteAuth" && msg.apiId) {
        await this._context.secrets.delete(this._authKey(msg.apiId));
      }
    });
  }

  private _authKey(apiId: string): string {
    return `apiExplorer.auth.${apiId}`;
  }

  // Looks up any locally saved credentials for the currently open API and,
  // if found, pushes them into the webview so the auth fields pre-fill.
  private async _sendSavedAuth() {
    const a = this._api;
    if (!a?.id || !a.authType || a.authType === "none") return;
    const raw = await this._context.secrets.get(this._authKey(a.id));
    if (!raw) return;
    try {
      this._panel.webview.postMessage({
        type: "authSecret",
        auth: JSON.parse(raw) as StoredAuth,
      });
    } catch {}
  }

  // The _update method updates the webview content based on the selected API
  private _update(api: unknown) {
    const a = api as {
      id: string;
      name: string;
      description: string;
      baseUrl: string;
      docsUrl: string;
      authType: string;
      endpoints: Array<{ path: string; method: string; summary: string }>;
    };
    this._api = a;
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
    const jsStr = (s: string) =>
      JSON.stringify(String(s)).replace(/</g, "\\u003c");
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

    const docsUrl = safe(api.docsUrl || "#");
    let authHtml = "";
    if (api.authType === "apiKey") {
      authHtml =
        '<label>Authentication</label><div class="auth-box">' +
        '<div class="auth-subtitle">API Key</div>' +
        '<div class="row"><input id="auth-key" type="password" placeholder="Enter your API key" />' +
        '<button id="auth-key-toggle" class="ghost-btn" type="button">&#128065; Show</button></div>' +
        '<p class="auth-hint">Sent as the <code>X-API-Key</code> header. ' +
        '<a href="' +
        docsUrl +
        '" target="_blank">Get your API key &rarr; API documentation</a></p>' +
        '<label class="checkbox-row"><input type="checkbox" id="auth-save" /> Save key locally</label>' +
        "</div>";
    } else if (api.authType === "bearer" || api.authType === "oauth2") {
      const isOauth = api.authType === "oauth2";
      authHtml =
        '<label>Authentication</label><div class="auth-box">' +
        '<div class="auth-subtitle">' +
        (isOauth ? "OAuth 2.0" : "Bearer Token") +
        "</div>" +
        (isOauth
          ? '<p class="auth-hint">API Explorer can\'t complete an OAuth login on your behalf &mdash; that requires an app registered with this provider. Get an access token from their docs or dashboard, then paste it below.</p>'
          : "") +
        '<div class="row"><input id="auth-token" type="password" placeholder="' +
        (isOauth ? "Paste your access token" : "Enter your bearer token") +
        '" />' +
        '<button id="auth-token-toggle" class="ghost-btn" type="button">&#128065; Show</button></div>' +
        '<p class="auth-hint">Sent as the <code>Authorization: Bearer</code> header. ' +
        '<a href="' +
        docsUrl +
        '" target="_blank">' +
        (isOauth ? "Get an access token" : "Get your token") +
        " &rarr; API documentation</a></p>" +
        '<label class="checkbox-row"><input type="checkbox" id="auth-save" /> Save token locally</label>' +
        "</div>";
    } else if (api.authType === "basic") {
      authHtml =
        '<label>Authentication</label><div class="auth-box">' +
        '<div class="auth-subtitle">Basic Authentication</div>' +
        '<label>Username</label><input id="auth-username" type="text" placeholder="username" />' +
        '<label>Password</label><div class="row"><input id="auth-password" type="password" placeholder="password" />' +
        '<button id="auth-password-toggle" class="ghost-btn" type="button">&#128065; Show</button></div>' +
        '<p class="auth-hint"><a href="' +
        docsUrl +
        '" target="_blank">API documentation</a></p>' +
        '<label class="checkbox-row"><input type="checkbox" id="auth-save" /> Save credentials locally</label>' +
        "</div>";
    }

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
      ".ghost-btn{background:transparent;border:1px solid var(--vscode-input-border);color:var(--vscode-foreground);flex:none;white-space:nowrap;}" +
      ".auth-box{background:var(--vscode-textCodeBlock-background);border:1px solid var(--vscode-widget-border);border-radius:6px;padding:12px;margin-top:6px;}" +
      ".auth-box label{margin-top:10px;}" +
      ".auth-box label:first-child{margin-top:0;}" +
      ".auth-subtitle{font-size:13px;font-weight:500;color:var(--vscode-foreground);}" +
      ".auth-hint{font-size:11px;color:var(--vscode-descriptionForeground);margin:8px 0 0;line-height:1.5;}" +
      ".auth-hint a{color:var(--vscode-textLink-foreground);}" +
      ".auth-hint code{font-family:var(--vscode-editor-font-family,monospace);}" +
      ".checkbox-row{display:flex;align-items:center;gap:6px;font-size:12px;text-transform:none;letter-spacing:normal;font-weight:400;color:var(--vscode-foreground);margin-top:10px;}" +
      ".checkbox-row input{width:auto;}" +
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
      authHtml +
      '<div style="margin-top:16px;display:flex;gap:8px;">' +
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
      "var authType=" +
      jsStr(api.authType || "none") +
      ";" +
      "var apiId=" +
      jsStr(api.id || "") +
      ";" +
      "function setupEyeToggle(inputId,btnId){" +
      "var btn=document.getElementById(btnId);" +
      "if(!btn)return;" +
      "btn.addEventListener('click',function(){" +
      "var input=document.getElementById(inputId);" +
      "if(input.type==='password'){input.type='text';btn.innerHTML='&#128064; Hide';}" +
      "else{input.type='password';btn.innerHTML='&#128065; Show';}" +
      "});" +
      "}" +
      "setupEyeToggle('auth-key','auth-key-toggle');" +
      "setupEyeToggle('auth-token','auth-token-toggle');" +
      "setupEyeToggle('auth-password','auth-password-toggle');" +
      "function collectAuthPayload(){" +
      "if(authType==='apiKey'){var el=document.getElementById('auth-key');return el?{authType:authType,value:el.value}:null;}" +
      "if(authType==='bearer'||authType==='oauth2'){var el=document.getElementById('auth-token');return el?{authType:authType,value:el.value}:null;}" +
      "if(authType==='basic'){var u=document.getElementById('auth-username');var p=document.getElementById('auth-password');return (u&&p)?{authType:authType,username:u.value,password:p.value}:null;}" +
      "return null;" +
      "}" +
      "var saveDebounce;" +
      "function maybeSaveAuth(){" +
      "var cb=document.getElementById('auth-save');" +
      "if(!cb||!cb.checked)return;" +
      "clearTimeout(saveDebounce);" +
      "saveDebounce=setTimeout(function(){" +
      "vscode.postMessage({type:'saveAuth',apiId:apiId,auth:collectAuthPayload()});" +
      "},400);" +
      "}" +
      "var saveCb=document.getElementById('auth-save');" +
      "if(saveCb){" +
      "saveCb.addEventListener('change',function(){" +
      "if(saveCb.checked){vscode.postMessage({type:'saveAuth',apiId:apiId,auth:collectAuthPayload()});}" +
      "else{vscode.postMessage({type:'deleteAuth',apiId:apiId});}" +
      "});" +
      "['auth-key','auth-token','auth-username','auth-password'].forEach(function(id){" +
      "var el=document.getElementById(id);" +
      "if(el)el.addEventListener('input',maybeSaveAuth);" +
      "});" +
      "}" +
      "function addAuthHeaders(headers){" +
      "if(authType==='apiKey'){" +
      "var el=document.getElementById('auth-key');" +
      "if(el&&el.value)headers['X-API-Key']=el.value;" +
      "}else if(authType==='bearer'||authType==='oauth2'){" +
      "var el=document.getElementById('auth-token');" +
      "if(el&&el.value)headers['Authorization']='Bearer '+el.value;" +
      "}else if(authType==='basic'){" +
      "var u=document.getElementById('auth-username');" +
      "var p=document.getElementById('auth-password');" +
      "var uv=u?u.value:'';var pv=p?p.value:'';" +
      "if(uv||pv)headers['Authorization']='Basic '+btoa(uv+':'+pv);" +
      "}" +
      "}" +
      "function doSend(){" +
      'var method=document.getElementById("method").value;' +
      'var url=document.getElementById("url").value;' +
      'var body=document.getElementById("body").value.trim();' +
      "var headers={};" +
      "addAuthHeaders(headers);" +
      "lastRequest={method:method,url:url,headers:headers,body:body||undefined};" +
      'document.getElementById("loading").style.display="block";' +
      'document.getElementById("response-body").textContent="";' +
      'document.getElementById("status").textContent="";' +
      'vscode.postMessage({type:"sendRequest",request:lastRequest});' +
      "}" +
      'document.getElementById("send-btn").addEventListener("click",doSend);' +
      'document.getElementById("send-btn2").addEventListener("click",doSend);' +
      'document.getElementById("copy-btn").addEventListener("click",function(){' +
      "if(!lastRequest)return;" +
      "var headersStr=JSON.stringify(lastRequest.headers||{},null,2);" +
      'var code="const res = await fetch(\'"+lastRequest.url+"\', {\\n  method: \'"+lastRequest.method+"\',\\n  headers: "+headersStr+(lastRequest.body?",\\n  body: "+JSON.stringify(lastRequest.body):"")+"\\n});\\nconst data = await res.json();\\nconsole.log(data);";' +
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
      "if(msg.type==='authSecret'&&msg.auth){" +
      "var auth=msg.auth;" +
      "var cb=document.getElementById('auth-save');" +
      "if(auth.authType==='apiKey'){" +
      "var el=document.getElementById('auth-key');" +
      "if(el){el.value=auth.value||'';if(cb)cb.checked=true;}" +
      "}else if(auth.authType==='bearer'||auth.authType==='oauth2'){" +
      "var el=document.getElementById('auth-token');" +
      "if(el){el.value=auth.value||'';if(cb)cb.checked=true;}" +
      "}else if(auth.authType==='basic'){" +
      "var u=document.getElementById('auth-username');" +
      "var p=document.getElementById('auth-password');" +
      "if(u&&p){u.value=auth.username||'';p.value=auth.password||'';if(cb)cb.checked=true;}" +
      "}" +
      "}" +
      "});" +
      "vscode.postMessage({type:'ready'});" +
      "}())" +
      "<\/script>" +
      "</body></html>"
    );
  }
}
