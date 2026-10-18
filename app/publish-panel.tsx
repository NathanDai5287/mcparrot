"use client";

import { useUser } from "@clerk/nextjs";
import { useState, type FormEvent } from "react";
import type { Website } from "../lib/capabilities";

type MarketplaceAction = { action: "publish"; appId: string; description: string } | { action: "unpublish"; appId: string };

function SharedPreview({ app, publisher }: { app: Website; publisher: string }) {
  return <div className="shared-preview">
    <p><strong>App name:</strong> {app.name}</p>
    <p><strong>Website address:</strong> {app.url}</p>
    <p><strong>Published by:</strong> {publisher}</p>
    {app.ordering?.enabled && <p><strong>Supports ordering.</strong> Copies always start with ordering off.</p>}
    <p><strong>Tasks:</strong> {app.tasks.length === 0 && "none"}</p>
    <ul>{app.tasks.map((task) => <li key={task.id}>
      <strong>{task.name}</strong>: {task.description}
      <span className="website-address">Requests: {task.requests.map((request) => `${request.method} ${request.urlPattern}`).join(", ")}</span>
      <span className="website-address">Inputs: {task.inputs.map((input) => `${input.name} (${input.description} For example, ${input.example}.)`).join(", ") || "none"} · Returns: {task.returns}</span>
    </li>)}</ul>
  </div>;
}

export function PublishPanel({ app, onApps }: { app: Website; onApps: (apps: Website[]) => void }) {
  const { user } = useUser();
  const [reviewing, setReviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function send(action: MarketplaceAction) {
    setBusy(true);
    setError("");
    const response = await fetch("/api/marketplace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action) }).catch(() => null);
    const result = await response?.json().catch(() => ({})) ?? {};
    setBusy(false);
    if (!response?.ok) {
      setError(result.error ?? "MCParrot could not reach the marketplace. Try again.");
      return;
    }
    onApps(result.apps);
    setReviewing(false);
  }

  function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    send({ action: "publish", appId: app.id, description: String(new FormData(event.currentTarget).get("description")).trim() });
  }

  const errorMessage = error && <p className="pilot-error" role="alert">{error}</p>;
  if (!reviewing) return <section className="assistant-section">
    <div>
      <h2>Marketplace</h2>
      <p>{app.listing ? `Published on ${new Date(app.listing.publishedAt).toLocaleDateString()}. Anyone can see this app’s name, website address, description, and task definitions on the marketplace.` : "Share this app’s tasks on the marketplace so other people can add them to their own apps. Your login, website sign-in, and ChatGPT link stay private."}</p>
      {errorMessage}
    </div>
    <div className="login-actions">
      <button className="button" disabled={busy} onClick={() => setReviewing(true)}>{app.listing ? "Update listing" : "Publish to marketplace"}</button>
      {app.listing && <button className="button danger" disabled={busy} onClick={() => send({ action: "unpublish", appId: app.id })}>{busy ? "Unpublishing…" : "Unpublish"}</button>}
    </div>
  </section>;

  return <section className="assistant-section order-section">
    <div>
      <h2>Publish {app.name} to the marketplace</h2>
      <p>Anyone can see everything below on the marketplace, without signing in. MCParrot never shares your saved login, browser sign-in, sign-in times, ChatGPT link, recordings, discovery results, or orders.</p>
    </div>
    <form className="editor" onSubmit={publish}>
      <label htmlFor={`listing-description-${app.id}`}>Short description</label>
      <textarea id={`listing-description-${app.id}`} name="description" maxLength={500} required defaultValue={app.listing?.description} placeholder="For example, read your courses, assignments, and syllabus on Canvas" />
      <SharedPreview app={app} publisher={user?.fullName ?? user?.username ?? "MCParrot user"} />
      {errorMessage}
      <div className="form-actions"><button className="button primary" type="submit" disabled={busy}>{busy ? "Publishing…" : app.listing ? "Update listing" : "Publish"}</button><button className="button" type="button" disabled={busy} onClick={() => setReviewing(false)}>Cancel</button></div>
    </form>
  </section>;
}
