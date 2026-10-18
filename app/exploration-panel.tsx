"use client";

import { useEffect, useState } from "react";
import type { Capability, CapturedRequest } from "../lib/capabilities";

type Exploration = { recording: boolean; requests: CapturedRequest[] };
type Choice = Capability & { selected: boolean };
const emptyExploration: Exploration = { recording: false, requests: [] };

export function requestExtension(action: string, appId: string, websiteUrl?: string): Promise<Exploration> {
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
    window.postMessage({ channel: "mcparrot-explorer-request", id, action, appId, websiteUrl }, window.location.origin);
  });
}

function CapabilityChoice({ choice, onChange }: { choice: Choice; onChange: (changes: Partial<Choice>) => void }) {
  const inputs = choice.inputs.map((input) => `${input.name} (for example, ${input.example})`).join(", ");
  return <div className="capability">
    <label className="capability-pick"><input type="checkbox" checked={choice.selected} onChange={(event) => onChange({ selected: event.target.checked })} />Keep this task</label>
    <input aria-label="Task name" value={choice.name} maxLength={80} onChange={(event) => onChange({ name: event.target.value })} />
    <textarea aria-label="Task description" value={choice.description} rows={2} maxLength={500} onChange={(event) => onChange({ description: event.target.value })} />
    <p className="field-help">Inputs: {inputs || "none"} · Returns: {choice.returns}</p>
    <p className="field-help">Uses {choice.requests.map((request) => `${request.method} ${request.urlPattern}`).join(", ")}</p>
  </div>;
}

export function ExplorationPanel({ appId, websiteUrl, active, onSave }: { appId: string; websiteUrl: string; active: boolean; onSave: (tasks: Capability[]) => void }) {
  const [state, setState] = useState(emptyExploration);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState<"" | "exploration" | "discovery">("");
  const [choices, setChoices] = useState<Choice[]>([]);
  const [error, setError] = useState("");

  async function run(work: typeof busy, operation: () => Promise<void>) {
    setBusy(work);
    setError("");
    try {
      await operation();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Something went wrong. Try again.");
    } finally {
      setBusy("");
    }
  }

  const operate = (action: string) => run("exploration", async () => {
    setState(await requestExtension(action, appId, websiteUrl));
    setConnected(true);
  });

  const discover = () => run("discovery", async () => {
    const response = await fetch("/api/discover", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ websiteUrl, requests: state.requests }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error ?? "Discovery failed. Try again.");
    setChoices(result.capabilities.map((capability: Capability) => ({ ...capability, selected: true })));
  });

  function changeChoice(index: number, changes: Partial<Choice>) {
    setChoices(choices.map((choice, position) => position === index ? { ...choice, ...changes } : choice));
  }

  const chosen = choices.filter((choice) => choice.selected);

  useEffect(() => {
    if (!active) return;
    const refresh = () => { void operate("status"); };
    window.addEventListener("focus", refresh);
    refresh();
    return () => window.removeEventListener("focus", refresh);
  }, [active, appId]);

  return <section className="teaching-pilot" aria-label="Explore the website in your browser" aria-busy={busy !== ""}>
    <h2>{state.recording ? "Explore the website in the other tab" : connected ? "Explore in your own browser" : "Set up your browser once"}</h2>
    <p>{state.recording ? "Browse the pages and features you use. Return here and stop exploring when you are done." : "Use your normal website sign-in. We record the data requests the website makes, with short samples of each response."}</p>
    {!connected && <>
      <ol>
        <li><a href="/downloads/mcparrot-explorer.zip" download>Download MCParrot Explorer</a>, then extract the downloaded ZIP.</li>
        <li>Open your browser’s Extensions page: <strong>chrome://extensions</strong> or <strong>edge://extensions</strong>.</li>
        <li>Enable <strong>Developer mode</strong>, select <strong>Load unpacked</strong>, and choose the extracted folder containing <strong>manifest.json</strong>.</li>
        <li>Reload this page.</li>
      </ol>
      <p className="field-help">Chrome or Edge only. This private extension is not in the extension store. It records only in the tab you open here, and the browser shows that the extension is debugging that tab.</p>
    </>}
    <div className="pilot-controls">
      {connected && <button className="button primary" disabled={busy !== ""} onClick={() => operate(state.recording ? "stop" : "start")}>{busy === "exploration" ? "Updating exploration…" : state.recording ? "Stop exploring" : state.requests.length ? "Continue exploring" : "Open website and explore"}</button>}
      <button className="button" disabled={busy !== ""} onClick={() => operate("status")}>{connected ? "Refresh" : "Check extension"}</button>
      {connected && <span role="status">{state.requests.length} data requests recorded{state.recording ? " · Exploring" : ""}</span>}
    </div>
    {!state.recording && state.requests.length > 0 && <div className="pilot-candidates">
      <details className="teaching-details">
        <summary>Recorded requests · {state.requests.length}</summary>
        <div className="candidate-list">
          {state.requests.map((request) => <div className="candidate-button" key={`${request.method} ${request.pattern}`}><span>{request.method} {request.pattern}<small>{request.status} · {request.contentType}</small></span></div>)}
        </div>
      </details>
      <p className="field-help">Headers, cookies, and sign-in traffic are not recorded. Selecting Find what this site can do sends these requests and their short samples to Cursor Composer.</p>
      <div className="pilot-controls">
        <button className="button primary" disabled={busy !== ""} onClick={discover}>{busy === "discovery" ? "Finding what this site can do…" : "Find what this site can do"}</button>
        <button className="button" disabled={busy !== ""} onClick={() => operate("clear")}>Delete recorded requests</button>
      </div>
    </div>}
    {choices.length > 0 && <div className="pilot-candidates">
      <h3>Choose the tasks to keep</h3>
      <div className="capability-list">{choices.map((choice, index) => <CapabilityChoice key={index} choice={choice} onChange={(changes) => changeChoice(index, changes)} />)}</div>
      <p className="field-help">Saving replaces this app’s current tasks. Tasks are not assistant tools yet.</p>
      <div className="pilot-controls"><button className="button primary" disabled={chosen.length === 0} onClick={() => onSave(chosen.map(({ selected, ...capability }) => capability))}>Save {chosen.length} {chosen.length === 1 ? "task" : "tasks"}</button></div>
    </div>}
    {error && <p className="pilot-error" role="alert">{error}</p>}
  </section>;
}
