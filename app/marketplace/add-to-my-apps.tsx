"use client";

import { useEffect, useState } from "react";

export function AddToMyApps({ listingId, signedIn, myAppId }: { listingId: string; signedIn: boolean; myAppId?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const reset = (event: PageTransitionEvent) => event.persisted && setBusy(false);
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);
  if (myAppId) return <span className="listing-action"><span className="badge">In your apps</span><a className="button" href={`/apps/${myAppId}`}>Open</a></span>;
  if (!signedIn) return <a className="button" href={`/sign-in?redirect_url=${encodeURIComponent(`/marketplace#${listingId}`)}`}>Sign in to add</a>;

  async function add() {
    setBusy(true);
    setError("");
    const response = await fetch("/api/marketplace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "install", listingId }) }).catch(() => null);
    const result = await response?.json().catch(() => ({})) ?? {};
    if (response?.ok || (response?.status === 409 && result.appId)) {
      window.location.assign(`/apps/${result.appId}`);
      return;
    }
    setBusy(false);
    setError(result.error ?? "MCParrot could not add this app. Try again.");
  }

  return <span className="listing-action">
    <button className="button primary" disabled={busy} onClick={add}>{busy ? "Adding…" : "Add to my apps"}</button>
    {error && <span className="pilot-error" role="alert">{error}</span>}
  </span>;
}
