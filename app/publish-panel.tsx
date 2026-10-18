"use client";

import { useUser } from "@clerk/nextjs";
import { useState, type FormEvent } from "react";
import type { TaskRequest, Website } from "../lib/capabilities";
import { SetupCard } from "./setup-card";

type MarketplaceAction = { action: "publish"; appId: string; description: string } | { action: "unpublish"; appId: string };

const requestText = ({ method, urlPattern, bodyPattern, contentType, headers = {}, tokenHeaders = [] }: TaskRequest) => [
  `${method} ${urlPattern}`,
  bodyPattern !== undefined && `with body ${bodyPattern}`,
  contentType && `as ${contentType}`,
  Object.keys(headers).length > 0 && `with headers ${Object.entries(headers).map(([name, value]) => `${name}: ${value}`).join("; ")}`,
  tokenHeaders.length > 0 && `with ${tokenHeaders.map(({ header, fromLocalStorage }) => `${header} from local storage ${fromLocalStorage}`).join("; ")}`,
].filter(Boolean).join(" ");

function SharedPreview({ app, publisher }: { app: Website; publisher: string }) {
  return <div className="shared-preview">
    <p><strong>App name:</strong> {app.name}</p>
    <p><strong>Website address:</strong> {app.url}</p>
    <p><strong>Published by:</strong> {publisher}</p>
    {app.ordering?.enabled && <p><strong>Supports ordering.</strong> Copies always start with ordering off.</p>}
    <p><strong>Tools:</strong> {app.tasks.length === 0 && "none"}</p>
    <ul>{app.tasks.map((task) => <li key={task.id}>
      <strong>{task.name}</strong>: {task.description}
      <span className="website-address">Requests: {task.requests.map((request, index) => `Step ${index + 1}: ${requestText(request)}`).join(" · ")}</span>
      <span className="website-address">Inputs: {task.inputs.map((input) => `${input.name} (${input.description} For example, ${input.example}.)`).join(", ") || "none"} · Returns: {task.returns}{task.keepFields?.length ? ` · Answer fields: ${task.keepFields.join(", ")}` : ""}</span>
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
  return <SetupCard title="Marketplace" status={app.listing ? "Published" : "Not published"}>
    {reviewing ? <>
      <p>Anyone can see the app name, website address, description, publisher, and tool names on the marketplace without signing in, and anyone who signs in and adds the app gets everything below, including the request bodies and headers. MCParrot never shares your saved login, browser sign-in, sign-in times, ChatGPT link, recordings, discovery results, or orders.</p>
      <form className="editor" onSubmit={publish}>
        <label htmlFor={`listing-description-${app.id}`}>Short description</label>
        <textarea id={`listing-description-${app.id}`} name="description" maxLength={500} required defaultValue={app.listing?.description} placeholder="For example, read your courses, assignments, and syllabus on Canvas" />
        <SharedPreview app={app} publisher={user?.fullName ?? user?.username ?? "MCParrot user"} />
        {errorMessage}
        <div className="form-actions"><button className="button primary" type="submit" disabled={busy}>{busy ? "Publishing…" : app.listing ? "Update listing" : "Publish"}</button><button className="button" type="button" disabled={busy} onClick={() => setReviewing(false)}>Cancel</button></div>
      </form>
    </> : <>
      <p>{app.listing ? `Published on ${new Date(app.listing.publishedAt).toLocaleDateString()}. Anyone can see this app’s name, website address, description, and tool names on the marketplace, and anyone who adds it gets its tool definitions.` : "Share this app’s tools on the marketplace so other people can add them to their own apps. Your login, website sign-in, and ChatGPT link stay private."}</p>
      {errorMessage}
      <div className="login-actions">
        <button className="button" disabled={busy} onClick={() => setReviewing(true)}>{app.listing ? "Update listing" : "Publish to marketplace"}</button>
        {app.listing && <button className="button danger" disabled={busy} onClick={() => send({ action: "unpublish", appId: app.id })}>{busy ? "Unpublishing…" : "Unpublish"}</button>}
      </div>
    </>}
  </SetupCard>;
}
