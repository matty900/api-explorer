"use client";

import { useState, type FormEvent } from "react";
import styles from "./submit.module.css";

const AUTH_TYPES = ["none", "apiKey", "bearer", "oauth2", "basic"] as const;
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

type Status = { kind: "idle" } | { kind: "success" } | { kind: "error"; messages: string[] };

export default function SubmitApiPage() {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setStatus({ kind: "idle" });

    const form = new FormData(e.currentTarget);
    const tags = String(form.get("tags") ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    const payload = {
      name: form.get("name"),
      description: form.get("description"),
      category: form.get("category"),
      authType: form.get("authType"),
      baseUrl: form.get("baseUrl"),
      docsUrl: form.get("docsUrl"),
      tags,
      endpoints: [
        {
          path: form.get("endpointPath"),
          method: form.get("endpointMethod"),
          summary: form.get("endpointSummary"),
        },
      ],
      email: form.get("email") || undefined,
      website: form.get("website"), // honeypot — real users never see this field
    };

    try {
      const res = await fetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) {
        setStatus({ kind: "error", messages: data.details ?? [data.error ?? "Submission failed"] });
      } else {
        setStatus({ kind: "success" });
        e.currentTarget.reset();
      }
    } catch {
      setStatus({ kind: "error", messages: ["Could not reach the server. Please try again."] });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Submit an API</h1>
      <p className={styles.subtitle}>
        Know a public API worth adding to the catalog? Fill this in — a maintainer reviews every
        submission before it goes live, so nothing is added automatically.
      </p>

      <form className={styles.form} onSubmit={handleSubmit}>
        <input
          type="text"
          name="website"
          className={styles.honeypot}
          tabIndex={-1}
          autoComplete="off"
        />

        <div className={styles.field}>
          <label htmlFor="name">API name</label>
          <input id="name" name="name" required maxLength={100} placeholder="e.g. OpenWeatherMap" />
        </div>

        <div className={styles.field}>
          <label htmlFor="description">Description</label>
          <textarea
            id="description"
            name="description"
            required
            maxLength={500}
            placeholder="What does this API do?"
          />
        </div>

        <div className={styles.row}>
          <div className={styles.field}>
            <label htmlFor="category">Category</label>
            <input id="category" name="category" required maxLength={50} placeholder="e.g. Weather" />
          </div>
          <div className={styles.field}>
            <label htmlFor="authType">Auth type</label>
            <select id="authType" name="authType" required defaultValue="none">
              {AUTH_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className={styles.field}>
          <label htmlFor="baseUrl">Base URL</label>
          <input
            id="baseUrl"
            name="baseUrl"
            type="url"
            required
            placeholder="https://api.example.com"
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="docsUrl">Documentation URL</label>
          <input
            id="docsUrl"
            name="docsUrl"
            type="url"
            required
            placeholder="https://example.com/docs"
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="tags">Tags</label>
          <input id="tags" name="tags" placeholder="comma, separated, tags" />
          <span className={styles.hint}>Optional — comma-separated, up to 15.</span>
        </div>

        <div className={styles.field}>
          <label>Example endpoint</label>
          <span className={styles.hint}>
            One endpoint is enough to get started — a maintainer can add more later.
          </span>
        </div>

        <div className={styles.row}>
          <div className={styles.field}>
            <label htmlFor="endpointMethod">Method</label>
            <select id="endpointMethod" name="endpointMethod" required defaultValue="GET">
              {METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.field}>
            <label htmlFor="endpointPath">Path</label>
            <input id="endpointPath" name="endpointPath" required placeholder="/weather" />
          </div>
        </div>

        <div className={styles.field}>
          <label htmlFor="endpointSummary">What does this endpoint do?</label>
          <input
            id="endpointSummary"
            name="endpointSummary"
            required
            maxLength={150}
            placeholder="e.g. Current weather by city"
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="email">Your email (optional)</label>
          <input id="email" name="email" type="email" placeholder="in case we have questions" />
        </div>

        <button className={styles.submit} type="submit" disabled={submitting}>
          {submitting ? "Submitting…" : "Submit for review"}
        </button>
      </form>

      {status.kind === "success" && (
        <div className={`${styles.message} ${styles.success}`}>
          Thanks! Your submission is pending review.
        </div>
      )}
      {status.kind === "error" && (
        <div className={`${styles.message} ${styles.error}`}>
          {status.messages.length === 1 ? (
            status.messages[0]
          ) : (
            <>
              Please fix the following:
              <ul className={styles.errorList}>
                {status.messages.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
