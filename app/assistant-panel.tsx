"use client";

import { useState } from "react";
import type { Website } from "../lib/capabilities";

type AppChanges = Pick<Website, "browserProfileId" | "signedInAt">;
type SignInBrowser = { browserId: string; liveUrl: string; popup: Window | null };

function SignInSection({ app, onChange }: { app: Website; onChange: (changes: AppChanges) => void }) {
  const [browser, setBrowser] = useState<SignInBrowser | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function startSignIn() {
    const popup = window.open("", "mcparrot-sign-in", "popup,width=1280,height=860");
    setBusy(true);
    setError("");
    const response = await fetch("/api/sign-in", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: app.name, websiteUrl: app.url, browserProfileId: app.browserProfileId }) }).catch(() => null);
    const result = await response?.json().catch(() => ({})) ?? {};
    setBusy(false);
    if (!response?.ok) {
      popup?.close();
      setError(result.error ?? "Browser Use could not open a sign-in browser. Try again.");
      return;
    }
    onChange({ browserProfileId: result.browserProfileId });
    setBrowser({ browserId: result.browserId, liveUrl: result.liveUrl, popup });
    if (popup) popup.location.href = result.liveUrl;
  }

  async function finishSignIn(signInBrowser: SignInBrowser) {
    setBusy(true);
    const response = await fetch(`/api/sign-in?browserId=${signInBrowser.browserId}`, { method: "DELETE" }).catch(() => null);
    setBusy(false);
    if (!response?.ok) {
      setError("MCParrot could not save the sign-in. Select Done signing in again.");
      return;
    }
    signInBrowser.popup?.close();
    onChange({ signedInAt: new Date().toISOString() });
    setBrowser(null);
  }

  const status = app.signedInAt ? `Signed in on ${new Date(app.signedInAt).toLocaleString()}.` : "Not signed in yet.";
  return <section className="assistant-section">
    <div>
      <h2>Website sign-in</h2>
      {browser ? <p>Sign in to {app.name} in the sign-in window, including any verification such as Duo. Then select Done signing in. <a href={browser.liveUrl} target="mcparrot-sign-in">Open the sign-in window</a></p>
        : <p>{status} Your assistant runs tasks in a hidden Browser Use browser that keeps this sign-in.</p>}
      {error && <p className="pilot-error" role="alert">{error}</p>}
    </div>
    {browser ? <button className="button primary" disabled={busy} onClick={() => finishSignIn(browser)}>{busy ? "Saving sign-in…" : "Done signing in"}</button>
      : <button className="button" disabled={busy} onClick={startSignIn}>{busy ? "Opening browser…" : "Sign in to website"}</button>}
  </section>;
}

function ConnectionSection({ app, connectionSecret }: { app: Website; connectionSecret?: string }) {
  const [copied, setCopied] = useState(false);
  if (!connectionSecret) return <section className="assistant-section"><div><h2>Use tasks in ChatGPT</h2><p>The connection link is available on the production site.</p></div></section>;
  const link = `${window.location.origin}/mcp/apps/${app.id}?x-vercel-protection-bypass=${connectionSecret}`;

  async function copyLink() {
    await navigator.clipboard.writeText(link);
    setCopied(true);
  }

  return <section className="assistant-section">
    <div>
      <h2>Use tasks in ChatGPT</h2>
      <p>This private link contains a secret code. Anyone with the link can use MCParrot, so keep it private. ChatGPT gets this app’s reading tasks only.</p>
      <ol className="field-help">
        <li>Copy the link.</li>
        <li>In ChatGPT, open Settings, then Apps &amp; Connectors, then Advanced settings, and turn on Developer mode.</li>
        <li>Select Create, name the connector {app.name}, paste the link as the MCP server URL, and choose No authentication.</li>
        <li>In a new chat, ask ChatGPT to use {app.name}.</li>
      </ol>
    </div>
    <button className="button primary" onClick={copyLink}>{copied ? "Link copied" : "Copy link"}</button>
  </section>;
}

export function AssistantPanel({ app, connectionSecret, onChange }: { app: Website; connectionSecret?: string; onChange: (changes: AppChanges) => void }) {
  return <>
    <SignInSection app={app} onChange={onChange} />
    <ConnectionSection app={app} connectionSecret={connectionSecret} />
  </>;
}
