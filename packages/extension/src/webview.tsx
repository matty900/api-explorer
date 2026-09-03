// This file contains the implementation of the webview that appears in the sidebar of the VS Code extension.
//  It renders a React component that allows users to search for APIs, filter them by category and
//  authentication type, and view the results. When a user clicks on an API,
// it sends a message to the extension to open the request builder with the selected API's details.
// webview.tsx is the view (sandboxed, browser-like, only talks to the outside world through that bridge).
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

function FilterIcon({ active }: { active: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: "block" }}
    >
      <path
        d="M1 3h14M3.5 8h9M6 13h4"
        stroke={active ? "var(--vscode-focusBorder)" : "currentColor"}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

type SearchMode = "auto" | "keyword" | "semantic";

const MODE_LABEL: Record<SearchMode, string> = {
  auto: "Auto",
  keyword: "Keyword",
  semantic: "Smart",
};

const MODE_TITLE: Record<SearchMode, string> = {
  auto: "Keyword for short queries, meaning-based for phrases",
  keyword: "Match names, descriptions and tags literally",
  semantic: "Describe what you want — ranked by meaning",
};

function App() {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<SearchMode>("auto");
  const [category, setCategory] = useState("All");
  const [categories, setCategories] = useState<string[]>(["All"]);
  const [results, setResults] = useState<Api[]>([]);
  const [degraded, setDegraded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedAuthTypes, setSelectedAuthTypes] = useState<Set<string>>(
    new Set(),
  );
  const debounce = useRef<ReturnType<typeof setTimeout>>();
  const filterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data;
      if (msg.type === "categoriesResult") {
        setCategories(["All", ...(msg.categories as string[])]);
      }
      if (msg.type === "searchResults") {
        setResults(msg.results.apis || []);
        setDegraded(Boolean(msg.results.degraded));
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
    vscode.postMessage({
      type: "search",
      query: "",
      category: "All",
      mode: "auto",
    });
    setLoading(true);
    return () => window.removeEventListener("message", handler);
  }, []);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setFilterOpen(false);
      }
    };
    if (filterOpen) document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [filterOpen]);

  // The search function sends a message to the extension to perform a search with the current query, category and search mode
  const search = (q: string, cat: string, m: SearchMode = mode) => {
    setLoading(true);
    setError("");
    vscode.postMessage({ type: "search", query: q, category: cat, mode: m });
  };

  // The handleInput function is called when the search input changes, and it debounces the search calls to avoid sending too many messages while the user is typing
  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => search(val, category), 400);
  };

  // The handleMode function switches the search engine and immediately re runs the current query
  const handleMode = (m: SearchMode) => {
    setMode(m);
    clearTimeout(debounce.current);
    search(query, category, m);
  };

  // The handleCategory function is called when a category pill is clicked, and it updates the category state and triggers a new search with the selected category
  const handleCategory = (cat: string) => {
    setCategory(cat);
    setQuery("");
    clearTimeout(debounce.current);
    search("", cat);
  };

  // The toggleAuthType function is called when an auth type filter checkbox is toggled, and it updates the set of selected auth types for filtering the results
  const toggleAuthType = (authType: string) => {
    setSelectedAuthTypes((prev) => {
      const next = new Set(prev);
      next.has(authType) ? next.delete(authType) : next.add(authType);
      return next;
    });
  };

  const availableAuthTypes = [
    ...new Set(results.map((a) => a.authType)),
  ].sort();
  const filteredResults =
    selectedAuthTypes.size === 0
      ? results
      : results.filter((a) => selectedAuthTypes.has(a.authType));
  const isFiltered = selectedAuthTypes.size > 0;

  return (
    <div style={{ padding: 12 }}>
      {/* Search row with filter button */}
      <div
        style={{
          display: "flex",
          gap: 6,
          marginBottom: 10,
          alignItems: "center",
        }}
      >
        <input
          type="text"
          value={query}
          onChange={handleInput}
          placeholder="Search APIs... e.g. weather, or describe what you need"
          style={{
            flex: 1,
            padding: "7px 10px",
            background: "var(--vscode-input-background)",
            color: "var(--vscode-input-foreground)",
            border: "1px solid var(--vscode-input-border)",
            borderRadius: 4,
            fontSize: 13,
            fontFamily: "inherit",
          }}
        />

        {/* Filter button + dropdown */}
        <div ref={filterRef} style={{ position: "relative", flexShrink: 0 }}>
          <button
            onClick={() => setFilterOpen((o) => !o)}
            title="Filter by auth type"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 30,
              height: 30,
              padding: 0,
              borderRadius: 4,
              cursor: "pointer",
              border: `1px solid ${isFiltered ? "var(--vscode-focusBorder)" : "var(--vscode-input-border)"}`,
              background: isFiltered
                ? "var(--vscode-focusBorder)22"
                : "var(--vscode-input-background)",
              color: isFiltered
                ? "var(--vscode-focusBorder)"
                : "var(--vscode-foreground)",
              position: "relative",
            }}
          >
            <FilterIcon active={isFiltered} />
            {isFiltered && (
              <span
                style={{
                  position: "absolute",
                  top: 2,
                  right: 2,
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "var(--vscode-focusBorder)",
                }}
              />
            )}
          </button>

          {filterOpen && (
            <div
              style={{
                position: "absolute",
                top: "calc(100% + 4px)",
                right: 0,
                minWidth: 160,
                background: "var(--vscode-input-background)",
                border: "1px solid var(--vscode-widget-border)",
                borderRadius: 6,
                boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                zIndex: 100,
                padding: "6px 0",
              }}
            >
              <div
                style={{
                  padding: "4px 12px 6px",
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: ".06em",
                  textTransform: "uppercase",
                  color: "var(--vscode-descriptionForeground)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                Auth Type
                {isFiltered && (
                  <button
                    onClick={() => setSelectedAuthTypes(new Set())}
                    style={{
                      fontSize: 10,
                      padding: "1px 5px",
                      borderRadius: 3,
                      border: "none",
                      background: "transparent",
                      color: "var(--vscode-focusBorder)",
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    Clear
                  </button>
                )}
              </div>
              {availableAuthTypes.map((authType) => {
                const checked = selectedAuthTypes.has(authType);
                const color = AUTH_COLOR[authType] ?? "#888";
                const label = AUTH_LABEL[authType] ?? authType;
                return (
                  <label
                    key={authType}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "5px 12px",
                      cursor: "pointer",
                      fontSize: 12,
                      background: checked
                        ? "var(--vscode-list-hoverBackground)"
                        : "transparent",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleAuthType(authType)}
                      style={{ accentColor: color, margin: 0 }}
                    />
                    <span
                      style={{
                        display: "inline-block",
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: color,
                        flexShrink: 0,
                      }}
                    />
                    {label}
                  </label>
                );
              })}
              {availableAuthTypes.length === 0 && (
                <div
                  style={{
                    padding: "5px 12px",
                    fontSize: 12,
                    color: "var(--vscode-descriptionForeground)",
                  }}
                >
                  No results to filter
                </div>
              )}
            </div>
          )}
        </div>

        <button
          onClick={() => vscode.postMessage({ type: "submitApi" })}
          title="Submit an API for the catalog"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 30,
            height: 30,
            padding: 0,
            borderRadius: 4,
            cursor: "pointer",
            flexShrink: 0,
            border: "1px solid var(--vscode-input-border)",
            background: "var(--vscode-input-background)",
            color: "var(--vscode-foreground)",
            fontSize: 16,
            lineHeight: 1,
            fontFamily: "inherit",
          }}
        >
          +
        </button>
      </div>

      {/* Search mode toggle */}
      <div
        style={{
          display: "flex",
          gap: 4,
          marginBottom: 10,
          alignItems: "center",
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: ".06em",
            textTransform: "uppercase",
            color: "var(--vscode-descriptionForeground)",
            marginRight: 2,
          }}
        >
          Search
        </span>
        {(["auto", "keyword", "semantic"] as SearchMode[]).map((m) => (
          <button
            key={m}
            onClick={() => handleMode(m)}
            title={MODE_TITLE[m]}
            style={{
              fontSize: 11,
              padding: "3px 8px",
              borderRadius: 99,
              cursor: "pointer",
              border: "1px solid",
              borderColor:
                mode === m
                  ? "var(--vscode-focusBorder)"
                  : "var(--vscode-widget-border)",
              background:
                mode === m ? "var(--vscode-button-background)" : "transparent",
              color:
                mode === m
                  ? "var(--vscode-button-foreground)"
                  : "var(--vscode-foreground)",
              fontFamily: "inherit",
            }}
          >
            {MODE_LABEL[m]}
          </button>
        ))}
      </div>

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
      {!loading && degraded && mode !== "keyword" && (
        <p
          style={{ color: "var(--vscode-descriptionForeground)", fontSize: 11 }}
        >
          Smart search is unavailable on this backend — showing keyword results.
        </p>
      )}
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
      {!loading && searched && filteredResults.length === 0 && (
        <p
          style={{ color: "var(--vscode-descriptionForeground)", fontSize: 12 }}
        >
          {results.length > 0
            ? "No APIs match the selected filters."
            : "No APIs found. Try a different term."}
        </p>
      )}

      {/* Results */}
      {filteredResults.map((api) => (
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
