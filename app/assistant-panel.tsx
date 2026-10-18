"use client";

import { useState, type FormEvent } from "react";
import type { Website } from "../lib/capabilities";

type AppChanges = Partial<Pick<Website, "browserProfileId" | "signedInAt" | "loginSavedAt">>;
type SignInBrowser = { browserId: string; liveUrl: string; popup: Window | null };

function SignInSection({ app, onChange }: { app: Website; onChange: (changes: AppChanges) => void }) {
  const [browser, setBrowser] = useState<SignInBrowser | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function startSignIn() {
    const popup = window.open("", "mcparrot-sign-in", "popup,width=1280,height=860");
    setBusy(true);
    setError("");
    const response = await fetch("/api/sign-in", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ appId: app.id, name: app.name, websiteUrl: app.url, browserProfileId: app.browserProfileId }) }).catch(() => null);
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
    const response = await fetch(`/api/sign-in?browserId=${signInBrowser.browserId}&appId=${app.id}`, { method: "DELETE" }).catch(() => null);
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

function LoginSection({ app, onChange }: { app: Website; onChange: (changes: AppChanges) => void }) {
  const [replacing, setReplacing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function saveLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    const response = await fetch("/api/login", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ appId: app.id, websiteUrl: app.url, username: fields.get("username"), password: fields.get("password") }) }).catch(() => null);
    const result = await response?.json().catch(() => ({})) ?? {};
    setBusy(false);
    if (!response?.ok) {
      setError(result.error ?? "MCParrot could not save the login. Try again.");
      return;
    }
    onChange({ loginSavedAt: new Date().toISOString() });
    setReplacing(false);
  }

  async function deleteLogin() {
    setBusy(true);
    setError("");
    const response = await fetch(`/api/login?appId=${app.id}`, { method: "DELETE" }).catch(() => null);
    setBusy(false);
    if (!response?.ok) {
      setError("MCParrot could not delete the login. Try again.");
      return;
    }
    onChange({ loginSavedAt: undefined });
  }

  if (app.loginSavedAt && !replacing) return <section className="assistant-section">
    <div>
      <h2>Saved login</h2>
      <p>Login saved. When the website signs out, MCParrot signs in again with it and asks you in ChatGPT for any text-message code.</p>
      {error && <p className="pilot-error" role="alert">{error}</p>}
    </div>
    <div className="login-actions"><button className="button" disabled={busy} onClick={() => setReplacing(true)}>Replace</button><button className="button danger" disabled={busy} onClick={deleteLogin}>Delete</button></div>
  </section>;

  return <section className="assistant-section">
    <form className="editor" onSubmit={saveLogin}>
      <h2>Save login</h2>
      <p>Save your username and password for {app.name} so MCParrot can sign in again when the website signs out. MCParrot encrypts them and never shows the password again.</p>
      <label htmlFor={`login-username-${app.id}`}>Username</label>
      <input id={`login-username-${app.id}`} name="username" autoComplete="off" required />
      <label htmlFor={`login-password-${app.id}`}>Password</label>
      <input id={`login-password-${app.id}`} name="password" type="password" autoComplete="new-password" required />
      {error && <p className="pilot-error" role="alert">{error}</p>}
      <div className="form-actions"><button className="button primary" type="submit" disabled={busy}>{busy ? "Saving login…" : "Save login"}</button>{replacing && <button className="button" type="button" onClick={() => setReplacing(false)}>Cancel</button>}</div>
    </form>
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
        <li>In ChatGPT, open Settings, then Plugins, and select Browse directory.</li>
        <li>Select Add, then Add custom MCP server.</li>
        <li>Name it {app.name}, paste the link as the Server URL, and set Authentication to No authentication.</li>
        <li>Tick I understand and want to continue, then select Create as a plugin.</li>
        <li>In a new chat, turn on the {app.name} plugin and ask ChatGPT to use it.</li>
      </ol>
    </div>
    <button className="button primary" onClick={copyLink}>{copied ? "Link copied" : "Copy link"}</button>
  </section>;
}

export function AssistantPanel({ app, connectionSecret, onChange }: { app: Website; connectionSecret?: string; onChange: (changes: AppChanges) => void }) {
  return <>
    <SignInSection app={app} onChange={onChange} />
    <LoginSection app={app} onChange={onChange} />
    <ConnectionSection app={app} connectionSecret={connectionSecret} />
  </>;
}
