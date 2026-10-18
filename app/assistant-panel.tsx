"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Website } from "../lib/capabilities";
import { SetupCard } from "./setup-card";

type AppChanges = Partial<Pick<Website, "browserProfileId" | "signedInAt" | "loginSavedAt">>;
type SignInBrowser = { appId: string; browserId: string; liveUrl: string; startedAt: number };

const signInMinutes = 15;
const signInStorageKey = (appId: string) => `mcparrot-sign-in:${appId}`;

function storedSignInBrowser(appId: string): SignInBrowser | null {
  try {
    const stored = JSON.parse(window.sessionStorage.getItem(signInStorageKey(appId)) ?? "null") as SignInBrowser | null;
    if (stored?.appId === appId && Date.now() - stored.startedAt < signInMinutes * 60_000) return stored;
    window.sessionStorage.removeItem(signInStorageKey(appId));
  } catch {}
  return null;
}

function rememberSignInBrowser(appId: string, browser: SignInBrowser | null) {
  try {
    if (browser) window.sessionStorage.setItem(signInStorageKey(appId), JSON.stringify(browser));
    else window.sessionStorage.removeItem(signInStorageKey(appId));
  } catch {}
}

function openSignInWindow(url?: string) {
  const popup = window.open("", "mcparrot-sign-in", "popup,width=1280,height=860");
  if (!popup) return null;
  try { popup.opener = null; } catch {}
  if (url) popup.location.href = url;
  return popup;
}

function SignInSection({ app, onChange }: { app: Website; onChange: (changes: AppChanges) => void }) {
  const [browser, setBrowser] = useState<SignInBrowser | null>(() => storedSignInBrowser(app.id));
  const popupRef = useRef<Window | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function saveBrowser(nextBrowser: SignInBrowser | null) {
    rememberSignInBrowser(app.id, nextBrowser);
    setBrowser(nextBrowser);
  }

  async function startSignIn() {
    const popup = openSignInWindow();
    setBusy(true);
    setError("");
    const response = await fetch("/api/sign-in", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ appId: app.id }) }).catch(() => null);
    const result = await response?.json().catch(() => ({})) ?? {};
    setBusy(false);
    if (!response?.ok) {
      popup?.close();
      setError(result.error ?? "Browser Use could not open a sign-in browser. Try again.");
      return;
    }
    onChange({ browserProfileId: result.browserProfileId });
    popupRef.current = popup;
    saveBrowser({ appId: app.id, browserId: result.browserId, liveUrl: result.liveUrl, startedAt: Date.now() });
    if (popup) popup.location.href = result.liveUrl;
  }

  async function stopSignIn(signInBrowser: SignInBrowser, finished: boolean) {
    setBusy(true);
    setError("");
    const response = await fetch(`/api/sign-in?browserId=${encodeURIComponent(signInBrowser.browserId)}&appId=${encodeURIComponent(app.id)}${finished ? "" : "&finished=false"}`, { method: "DELETE" }).catch(() => null);
    const result = await response?.json().catch(() => ({})) ?? {};
    setBusy(false);
    if (!response?.ok) {
      setError(result.error ?? (finished ? "MCParrot could not save the sign-in. Select Done signing in again." : "MCParrot could not stop the sign-in browser. Select Cancel again."));
      return;
    }
    popupRef.current?.close();
    popupRef.current = null;
    if (finished) onChange({ signedInAt: new Date().toISOString() });
    saveBrowser(null);
  }

  const status = app.signedInAt ? `Signed in on ${new Date(app.signedInAt).toLocaleString()}.` : "Not signed in yet.";
  return <SetupCard title="Website sign-in" status={browser ? "Signing in" : app.signedInAt ? "Signed in" : "Not signed in"} className="sentry-block">
    {browser ? <p>Sign in to {app.name} in the sign-in window, including any verification such as Duo. Then select Done signing in. If the window did not open, select Open the sign-in window.</p>
      : <p>{status} Your assistant runs tools in a hidden Browser Use browser that keeps this sign-in.</p>}
    {error && <p className="pilot-error" role="alert">{error}</p>}
    {browser ? <div className="login-actions"><button className="button primary" disabled={busy} onClick={() => stopSignIn(browser, true)}>{busy ? "Saving sign-in…" : "Done signing in"}</button><button className="button" disabled={busy} onClick={() => { popupRef.current = openSignInWindow(browser.liveUrl) ?? popupRef.current; }}>Open the sign-in window</button><button className="button" disabled={busy} onClick={() => stopSignIn(browser, false)}>Cancel</button></div>
      : <div className="login-actions"><button className="button" disabled={busy} onClick={startSignIn}>{busy ? "Opening browser…" : "Sign in to website"}</button></div>}
  </SetupCard>;
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

  return <SetupCard title="Saved login" status={app.loginSavedAt ? "Saved" : "Not saved"}>
    {app.loginSavedAt && !replacing ? <>
      <p>Login saved. When the website signs out, MCParrot signs in again with it and asks you in ChatGPT for any text-message code.</p>
      {error && <p className="pilot-error" role="alert">{error}</p>}
      <div className="login-actions"><button className="button" disabled={busy} onClick={() => { setError(""); setReplacing(true); }}>Replace</button><button className="button danger" disabled={busy} onClick={deleteLogin}>Delete</button></div>
    </> : <form className="editor" onSubmit={saveLogin}>
      <p>Save your username and password for {app.name} so MCParrot can sign in again when the website signs out. MCParrot encrypts them and never shows the password again.</p>
      <label htmlFor={`login-username-${app.id}`}>Username</label>
      <input id={`login-username-${app.id}`} name="username" autoComplete="off" required />
      <label htmlFor={`login-password-${app.id}`}>Password</label>
      <input id={`login-password-${app.id}`} name="password" type="password" autoComplete="new-password" required />
      {error && <p className="pilot-error" role="alert">{error}</p>}
      <div className="form-actions"><button className="button primary" type="submit" disabled={busy}>{busy ? "Saving login…" : "Save login"}</button>{replacing && <button className="button" type="button" onClick={() => { setError(""); setReplacing(false); }}>Cancel</button>}</div>
    </form>}
  </SetupCard>;
}

function ConnectionSteps({ app }: { app: Website }) {
  return <ol className="field-help">
    <li>Copy the link.</li>
    <li>In ChatGPT, open Settings, then Plugins, and select Browse directory.</li>
    <li>Select Add, then Add custom MCP server.</li>
    <li>Name it {app.name}, paste the link as the Server URL, and set Authentication to No authentication.</li>
    <li>Tick I understand and want to continue, then select Create as a plugin.</li>
    <li>In a new chat, turn on the {app.name} plugin and ask ChatGPT to use it.</li>
  </ol>;
}

function ConnectionSection({ app, onApps }: { app: Website; onApps: (apps: Website[]) => void }) {
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 3000);
    return () => clearTimeout(timer);
  }, [copied]);

  async function createLink() {
    setBusy(true);
    setError("");
    const response = await fetch("/api/connection", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ appId: app.id }) }).catch(() => null);
    const result = await response?.json().catch(() => ({})) ?? {};
    setBusy(false);
    if (!response?.ok) {
      setError(result.error ?? "MCParrot could not create the link. Try again.");
      return;
    }
    onApps(result.apps);
    setLink(`${window.location.origin}/mcp/apps/${app.id}?token=${result.token}`);
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      setCopyFailed(false);
      setCopied(true);
    } catch {
      setCopied(false);
      setCopyFailed(true);
    }
  }

  const linkButton = <button className="button" disabled={busy} onClick={createLink}>{busy ? "Creating link…" : app.connectionTokenHash ? "Regenerate link" : "Create link"}</button>;
  return <SetupCard title="Use in ChatGPT" status={app.connectionTokenHash ? "Link created" : "No link"}>
    {link ? <>
      <p>Copy this link now, because MCParrot shows it only once. Anyone with the link can use this app’s tools in ChatGPT, so keep it private.</p>
      <div className="login-actions"><button className="button primary" onClick={copyLink}>{copied ? "Link copied" : "Copy link"}</button>{linkButton}</div>
      {copyFailed && <><p className="pilot-error" role="alert">MCParrot could not copy the link. Copy it from this box instead.</p><input className="connection-link" aria-label="Connection link" readOnly value={link} autoFocus onFocus={(event) => event.currentTarget.select()} /></>}
    </> : <>
      <p>{app.connectionTokenHash ? "This app has a private ChatGPT link. MCParrot shows a link only once, when you create it. Regenerate the link to get a new one, and the old link stops working." : "Create a private link that gives ChatGPT this app’s tools."}</p>
      <div className="login-actions">{linkButton}</div>
    </>}
    {error && <p className="pilot-error" role="alert">{error}</p>}
    <details className="setup-steps">
      <summary>How to add it to ChatGPT</summary>
      <ConnectionSteps app={app} />
    </details>
  </SetupCard>;
}

export function AssistantPanel({ app, onChange, onApps }: { app: Website; onChange: (changes: AppChanges) => void; onApps: (apps: Website[]) => void }) {
  return <>
    <SignInSection key={app.id} app={app} onChange={onChange} />
    <LoginSection app={app} onChange={onChange} />
    <ConnectionSection app={app} onApps={onApps} />
  </>;
}
