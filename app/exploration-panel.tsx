"use client";

import { useEffect, useState } from "react";
import { CloudTeachingPanel } from "./teaching-panel";

type Candidate = { id: string; path: string; label: string; courseId: string; kind: string };
type Exploration = { recording: boolean; candidates: Candidate[] };
const emptyExploration: Exploration = { recording: false, candidates: [] };

export function requestExtension(action: string, appId: string): Promise<Exploration> {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const timeout = window.setTimeout(() => {
      window.removeEventListener("message", receive);
      reject(new Error("Enable MCParrot Explorer, then reload this page."));
    }, 3000);
    function receive(event: MessageEvent) {
      if (event.source !== window || event.origin !== window.location.origin) return;
      if (event.data?.channel !== "mcparrot-explorer-response" || event.data.id !== id) return;
      window.clearTimeout(timeout);
      window.removeEventListener("message", receive);
      if (event.data.error) reject(new Error(event.data.error));
      else resolve(event.data.state);
    }
    window.addEventListener("message", receive);
    window.postMessage({ channel: "mcparrot-explorer-request", id, action, appId }, window.location.origin);
  });
}

export function ExplorationPanel({ appId, taskId, websiteUrl, active }: { appId: string; taskId: string; websiteUrl: string; active: boolean }) {
  const [state, setState] = useState(emptyExploration);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showEarlierSession, setShowEarlierSession] = useState(false);
  const supported = new URL(websiteUrl).origin === "https://bcourses.berkeley.edu";

  async function operate(action: string) {
    setBusy(true);
    setError("");
    try {
      setState(await requestExtension(action, appId));
      setConnected(true);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The extension did not respond.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!active || !supported) return;
    const refresh = () => { void operate("status"); };
    window.addEventListener("focus", refresh);
    refresh();
    return () => window.removeEventListener("focus", refresh);
  }, [active, appId, supported]);

  if (!supported) return <section className="teaching-pilot"><h2>This website is not supported yet</h2><p>The extension does not observe reading routes on this website yet. Other websites need capture support before they can suggest actions.</p></section>;

  return <>
    <section className="teaching-pilot" aria-label="Explore the website in your browser" aria-busy={busy}>
      <h2>{state.recording ? "Explore the website in the other tab" : connected ? "Explore in your own browser" : "Set up your browser once"}</h2>
      <p>{state.recording ? "Browse the pages you use. Return here when you are ready to review the observed reading actions." : "Use your normal website sign-in without a streamed browser. You do not need to create tasks one by one."}</p>
      {!connected && <>
        <ol>
          <li><a href="/downloads/mcparrot-explorer.zip" download>Download MCParrot Explorer</a>, then extract the downloaded ZIP.</li>
          <li>Open your browser’s Extensions page: <strong>chrome://extensions</strong> or <strong>edge://extensions</strong>.</li>
          <li>Enable <strong>Developer mode</strong>, select <strong>Load unpacked</strong>, and choose the extracted folder containing <strong>manifest.json</strong>.</li>
          <li>Reload this page.</li>
        </ol>
        <p className="field-help">Chrome or Edge only. This private extension is not in the extension store. It observes supported reading routes only in the tab you open here.</p>
      </>}
      <div className="pilot-controls">
        {connected && <button className="button primary" disabled={busy} onClick={() => operate(state.recording ? "stop" : "start")}>{busy ? "Updating exploration…" : state.recording ? "Review suggested actions" : state.candidates.length ? "Continue exploring" : "Open website and explore"}</button>}
        <button className="button" disabled={busy} onClick={() => operate("status")}>{connected ? "Refresh observations" : "Check extension"}</button>
        {connected && <span role="status">{state.candidates.length} observed reading routes{state.recording ? " · Exploring" : ""}</span>}
      </div>
      {connected && !state.recording && state.candidates.length === 0 && <p className="field-help">Open assignments, modules, or a syllabus after exploration starts. Already loaded pages may need a refresh.</p>}
      {!state.recording && state.candidates.length > 0 && <div className="pilot-candidates">
        <h3>Suggested reading actions</h3>
        <p>These observations are not working tools yet. Each action still needs a separate authenticated cloud test before publication.</p>
        <div className="candidate-list">
          {state.candidates.map((candidate) => <div className="candidate-button" key={candidate.id}><span>{candidate.label}<small>Course {candidate.courseId}</small></span><span className="candidate-action">Needs test</span></div>)}
        </div>
        <p className="field-help">Only supported reading paths are saved in the extension. Passwords, cookies, page content, request bodies, and query values are not copied.</p>
        <button className="button" disabled={busy} onClick={() => operate("clear")}>Delete observed actions</button>
      </div>}
      {error && <p className="pilot-error" role="alert">{error}</p>}
    </section>
    <details className="teaching-details" onToggle={(event) => setShowEarlierSession(event.currentTarget.open)}>
      <summary>Earlier cloud exploration session</summary>
      <p>This keeps your earlier cloud session accessible. Normal exploration now uses the extension.</p>
      {showEarlierSession && <CloudTeachingPanel appId={appId} taskId={taskId} websiteUrl={websiteUrl} active={active} />}
    </details>
  </>;
}
