import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";

declare function acquireVsCodeApi(): {
  postMessage: (msg: unknown) => void;
};

const vscode = acquireVsCodeApi();


const AUTH_COLOR: Record<string, string> = {
  none: "#1d9e75",
  apiKey: "#ba7517",
  oauth2: "#533ab7",
  bearer: "#533ab7",
};

const AUTH_LABEL: Record<string, string> = {
  none: "Free",
  apiKey: "API Key",
  oauth2: "OAuth",
  bearer: "Bearer",
};

interface Api {
  id: string;
  name: string;
  description: string;
  category: string;
  authType: string;
  baseUrl: string;
  docsUrl: string;
  tags: string[];
  endpoints: unknown[];
}

function App() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [categories, setCategories] = useState<string[]>(["All"]);
  const [results, setResults] = useState<Api[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data;
      if (msg.type === "categoriesResult") {
        setCategories(["All", ...(msg.categories as string[])]);
      }
      if (msg.type === "searchResults") {
        setResults(msg.results.apis || []);
        setLoading(false);
        setSearched(true);
        setError("");
      }
      if (msg.type === "error") {
        setError(msg.message);
        setLoading(false);
      }
    };
    window.addEventListener("message", handler);
    vscode.postMessage({ type: "getCategories" });
    vscode.postMessage({ type: "search", query: "", category: "All" });
    setLoading(true);
    return () => window.removeEventListener("message", handler);
  }, []);

  const search = (q: string, cat: string) => {
    setLoading(true);
    setError("");
    vscode.postMessage({ type: "search", query: q, category: cat });
  };

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => search(val, category), 400);
  };

  const handleCategory = (cat: string) => {
    setCategory(cat);
    setQuery("");
    clearTimeout(debounce.current);
    search("", cat);
  };

  return (
    <div style={{ padding: 12 }}>
      {/* Search input */}
      <input
        type="text"
        value={query}
        onChange={handleInput}
        placeholder="Search APIs... e.g. weather, games"
        style={{
          width: "100%",
          padding: "7px 10px",
          background: "var(--vscode-input-background)",
          color: "var(--vscode-input-foreground)",
          border: "1px solid var(--vscode-input-border)",
          borderRadius: 4,
          fontSize: 13,
          fontFamily: "inherit",
          marginBottom: 10,
        }}
      />

      {/* Category pills */}
      <div
        style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 12 }}
      >
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => handleCategory(cat)}
            style={{
              fontSize: 11,
              padding: "3px 8px",
              borderRadius: 99,
              cursor: "pointer",
              border: "1px solid",
              borderColor:
                category === cat
                  ? "var(--vscode-focusBorder)"
                  : "var(--vscode-widget-border)",
              background:
                category === cat
                  ? "var(--vscode-button-background)"
                  : "transparent",
              color:
                category === cat
                  ? "var(--vscode-button-foreground)"
                  : "var(--vscode-foreground)",
              fontFamily: "inherit",
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* States */}
      {loading && (
        <p
          style={{ color: "var(--vscode-descriptionForeground)", fontSize: 12 }}
        >
          Searching...
        </p>
      )}
      {error && (
        <p style={{ color: "var(--vscode-errorForeground)", fontSize: 12 }}>
          {error}
        </p>
      )}
      {!loading && searched && results.length === 0 && (
        <p
          style={{ color: "var(--vscode-descriptionForeground)", fontSize: 12 }}
        >
          No APIs found. Try a different term.
        </p>
      )}

      {/* Results */}
      {results.map((api) => (
        <div
          key={api.id}
          onClick={() =>
            vscode.postMessage({ type: "openRequestBuilder", api })
          }
          style={{
            background: "var(--vscode-list-hoverBackground)",
            border: "1px solid var(--vscode-widget-border)",
            borderRadius: 6,
            padding: "10px 12px",
            marginBottom: 8,
            cursor: "pointer",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLDivElement).style.borderColor =
              "var(--vscode-focusBorder)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLDivElement).style.borderColor =
              "var(--vscode-widget-border)";
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: 4,
            }}
          >
            <span style={{ fontWeight: 500 }}>{api.name}</span>
            <span
              style={{
                fontSize: 10,
                padding: "2px 6px",
                borderRadius: 99,
                background: AUTH_COLOR[api.authType] + "22",
                color: AUTH_COLOR[api.authType],
                fontWeight: 500,
              }}
            >
              {AUTH_LABEL[api.authType] || api.authType}
            </span>
          </div>
          <p
            style={{
              fontSize: 12,
              color: "var(--vscode-descriptionForeground)",
              margin: "0 0 6px",
              lineHeight: 1.4,
            }}
          >
            {api.description.slice(0, 85)}
            {api.description.length > 85 ? "…" : ""}
          </p>
          <span
            style={{
              fontSize: 10,
              padding: "2px 6px",
              borderRadius: 99,
              background: "#378add22",
              color: "#378add",
            }}
          >
            {api.category}
          </span>
        </div>
      ))}
    </div>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
