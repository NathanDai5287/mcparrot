"use client";

import { useState, type FormEvent } from "react";
import type { Website } from "../lib/capabilities";
import type { ImageView } from "../lib/view-image";
import { SetupCard } from "./setup-card";

export function ImagePanel({ app }: { app: Website }) {
  const [view, setView] = useState<ImageView>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function read(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setView(undefined);
    const url = String(new FormData(event.currentTarget).get("url")).trim();
    const response = await fetch("/api/image", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ appId: app.id, url }) }).catch(() => null);
    const result = await response?.json().catch(() => ({})) ?? {};
    setBusy(false);
    if (response?.ok) return setView(result);
    setError(result.error ?? "MCParrot could not read the image. Try again.");
  }

  return <SetupCard title="View image">
    <p>Paste the address of an image from {app.name}, such as a chart in a post. MCParrot opens an image on the website with your website sign-in, opens an https image on another website, such as its image server, without it, and copies its text and numbers, the same way ChatGPT’s view_image tool does.</p>
    <form className="editor" onSubmit={read}>
      <label htmlFor={`image-url-${app.id}`}>Image address</label>
      <input id={`image-url-${app.id}`} name="url" type="text" required maxLength={2000} placeholder="https://…" />
      <div className="form-actions"><button className="button" type="submit" disabled={busy}>{busy ? "Reading…" : "View image"}</button></div>
    </form>
    {error && <p className="pilot-error" role="alert">{error}</p>}
    {view?.image && <img className="viewed-image" src={view.image} alt="The image from the website" />}
    {view && <p className="viewed-image-text">{view.text}</p>}
  </SetupCard>;
}
