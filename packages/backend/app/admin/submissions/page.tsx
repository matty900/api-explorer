"use client";

import { useEffect, useState } from "react";
import styles from "./submissions.module.css";

interface Endpoint {
  path: string;
  method: string;
  summary: string;
}

interface Submission {
  id: string;
  name: string;
  description: string;
  category: string;
  authType: string;
  baseUrl: string;
  docsUrl: string;
  tags: string[];
  endpoints: Endpoint[];
  submitterEmail: string | null;
  createdAt: string;
}

const TOKEN_KEY = "api-explorer-admin-token";

export default function AdminSubmissionsPage() {
  const [token, setToken] = useState("");
  const [tokenInput, setTokenInput] = useState("");
  const [submissions, setSubmissions] = useState<Submission[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    const saved = sessionStorage.getItem(TOKEN_KEY);
    if (saved) setToken(saved);
  }, []);

  useEffect(() => {
    if (token) void loadSubmissions(token);
  }, [token]);

  async function loadSubmissions(t: string) {
    setError(null);
    try {
      const res = await fetch("/api/submissions?status=pending", {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? `Request failed (${res.status})`);
        setSubmissions(null);
        return;
      }
      const data = await res.json();
      setSubmissions(data.submissions);
    } catch {
      setError("Could not reach the server.");
    }
  }

  function handleTokenSubmit(e: React.FormEvent) {
    e.preventDefault();
    sessionStorage.setItem(TOKEN_KEY, tokenInput);
    setToken(tokenInput);
  }

  async function act(id: string, action: "approve" | "reject") {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/submissions/${id}/${action}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? `Failed to ${action}`);
        return;
      }
      setSubmissions((prev) => prev?.filter((s) => s.id !== id) ?? null);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusyId(null);
    }
  }

  if (!token) {
    return (
      <div className={styles.page}>
        <h1 className={styles.title}>Review submissions</h1>
        <form className={styles.tokenForm} onSubmit={handleTokenSubmit}>
          <input
            type="password"
            placeholder="Admin token"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
          />
          <button type="submit">Load</button>
        </form>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Pending submissions</h1>
      {error && <p className={styles.error}>{error}</p>}

      {submissions === null && !error && (
        <p className={styles.empty}>Loading…</p>
      )}
      {submissions?.length === 0 && (
        <p className={styles.empty}>Nothing pending review.</p>
      )}

      {submissions?.map((s) => (
        <div key={s.id} className={styles.card}>
          <div className={styles.cardHeader}>
            <h2>{s.name}</h2>
            <span className={styles.meta}>
              {new Date(s.createdAt).toLocaleDateString()}
            </span>
          </div>
          <p className={styles.description}>{s.description}</p>
          <div className={styles.tagRow}>
            <span className={styles.tag}>{s.category}</span>
            <span className={styles.tag}>{s.authType}</span>
            {s.tags.map((t) => (
              <span key={t} className={styles.tag}>
                {t}
              </span>
            ))}
          </div>
          <div className={styles.meta}>
            base: {s.baseUrl} · docs: {s.docsUrl}
            {s.submitterEmail ? ` · from: ${s.submitterEmail}` : ""}
          </div>
          {s.endpoints.map((ep, i) => (
            <div key={i} className={styles.endpoint}>
              {ep.method} {ep.path} — {ep.summary}
            </div>
          ))}
          <div className={styles.actions}>
            <button
              className={`${styles.action} ${styles.approve}`}
              disabled={busyId === s.id}
              onClick={() => act(s.id, "approve")}
            >
              Approve
            </button>
            <button
              className={`${styles.action} ${styles.reject}`}
              disabled={busyId === s.id}
              onClick={() => act(s.id, "reject")}
            >
              Reject
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
