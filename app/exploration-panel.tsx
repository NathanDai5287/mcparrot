"use client";

import { useEffect, useRef, useState } from "react";
import type { CapturedRequest, DiscoveredCapability, Task } from "../lib/capabilities";

type Exploration = { recording: boolean; requests: CapturedRequest[]; activeAppId?: string | null; saveError?: string };
type Choice = DiscoveredCapability & { selected: boolean };
export type SaveResult = { error?: string; skipped?: string[]; saved?: string[] };
const emptyExploration: Exploration = { recording: false, requests: [] };
const connectionToolNames = ["read_page", "view_image", "save_task", "submit_verification_code", "prepare_order", "check_order", "place_order", "cancel_order"];
const toolName = (taskName: string) => taskName.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 64);
const isText = (value: unknown) => typeof value === "string";
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

function isCapability(value: unknown): value is DiscoveredCapability {
  return isObject(value) && isText(value.name) && isText(value.description) && isText(value.returns)
    && (value.updatesTaskId === undefined || isText(value.updatesTaskId))
    && Array.isArray(value.inputs) && value.inputs.every((input) => isObject(input) && isText(input.name) && isText(input.description) && isText(input.example))
    && Array.isArray(value.requests) && value.requests.length > 0 && value.requests.every((request) => isObject(request) && isText(request.method) && isText(request.urlPattern));
}

function nameProblem(name: string, otherNames: string[]) {
  const tool = toolName(name);
  if (!tool) return "Give this tool a name with letters or numbers.";
  if (connectionToolNames.includes(tool)) return "MCParrot already uses this name. Choose another name.";
  if (otherNames.some((other) => toolName(other) === tool)) return "Another tool already uses this name. Choose another name.";
  return "";
}

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

function CapabilityChoice({ choice, updatedTask, problem, problemId, onChange }: { choice: Choice; updatedTask?: Task; problem: string; problemId: string; onChange: (changes: Partial<Choice>) => void }) {
  const inputs = choice.inputs.map((input) => `${input.name} (for example, ${input.example})`).join(", ");
  return <div className="capability" role="group" aria-label={choice.name.trim() || "Unnamed tool"}>
    <label className="capability-pick"><input type="checkbox" checked={choice.selected} onChange={(event) => onChange({ selected: event.target.checked })} />Keep this tool · {updatedTask ? `Updates ${updatedTask.name}` : "New"}</label>
    <input aria-label="Tool name" value={choice.name} maxLength={80} aria-invalid={problem ? true : undefined} aria-describedby={problem ? problemId : undefined} onChange={(event) => onChange({ name: event.target.value })} />
    {problem && <p className="pilot-error" id={problemId}>{problem}</p>}
    <textarea aria-label="Tool description" value={choice.description} rows={2} maxLength={500} onChange={(event) => onChange({ description: event.target.value })} />
    <p className="field-help">Inputs: {inputs || "none"} · Returns: {choice.returns}</p>
    <p className="field-help">Uses {choice.requests.map((request) => `${request.method} ${request.urlPattern}`).join(", ")}</p>
  </div>;
}

export function ExplorationPanel({ appId, websiteUrl, tasks, active, onSave }: { appId: string; websiteUrl: string; tasks: Task[]; active: boolean; onSave: (capabilities: DiscoveredCapability[]) => Promise<SaveResult> }) {
  const [state, setState] = useState(emptyExploration);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState<"" | "exploration" | "discovery" | "saving">("");
  const [choices, setChoices] = useState<Choice[]>([]);
  const [discoveredAt, setDiscoveredAt] = useState("");
  const [error, setError] = useState("");
  const working = useRef(false);
  const generation = useRef(0);

  async function run(work: typeof busy, operation: () => Promise<void>) {
    working.current = true;
    generation.current++;
    setBusy(work);
    setError("");
    try {
      await operation();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Something went wrong. Try again.");
    } finally {
      working.current = false;
      setBusy("");
    }
  }

  const operate = (action: string) => run("exploration", async () => {
    setState(await requestExtension(action, appId, websiteUrl));
    setConnected(true);
  });

  async function refreshStatus() {
    if (working.current) return;
    try {
      const nextState = await requestExtension("status", appId, websiteUrl);
      if (working.current) return;
      setState(nextState);
      setConnected(true);
    } catch {}
  }

  function showDiscovery(discovery: { discoveredAt?: unknown; capabilities?: unknown }) {
    if (!Array.isArray(discovery.capabilities) || !isText(discovery.discoveredAt)) throw new Error("Discovery returned a reply MCParrot could not read. Try again.");
    const capabilities: DiscoveredCapability[] = discovery.capabilities.filter(isCapability);
    setChoices(capabilities.map((capability) => ({ ...capability, selected: true })));
    setDiscoveredAt(discovery.discoveredAt);
    const skipped = discovery.capabilities.length - capabilities.length;
    if (skipped) setError(`MCParrot skipped ${skipped} suggested ${skipped === 1 ? "tool" : "tools"} it could not read.`);
  }

  const discover = () => run("discovery", async () => {
    const response = await fetch("/api/discover", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ appId, requests: state.requests }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error ?? "Discovery failed. Try again.");
    showDiscovery(result);
  });

  async function showLastDiscovery() {
    const started = generation.current;
    const response = await fetch(`/api/discover?appId=${encodeURIComponent(appId)}`).catch(() => null);
    const result = await response?.json().catch(() => ({})) ?? {};
    if (working.current || generation.current !== started) return;
    try {
      if (!response?.ok) throw new Error(result.error ?? "MCParrot could not load the last search. Reload the page to try again.");
      if (result.discovery) showDiscovery(result.discovery);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "MCParrot could not load the last search. Reload the page to try again.");
    }
  }

  const clearRequests = () => run("exploration", async () => {
    setState(await requestExtension("clear", appId, websiteUrl));
    setConnected(true);
    setChoices([]);
  });

  function changeChoice(index: number, changes: Partial<Choice>) {
    generation.current++;
    setChoices(choices.map((choice, position) => position === index ? { ...choice, ...changes } : choice));
  }

  const chosen = choices.filter((choice) => choice.selected);
  const otherTaskNames = (choice: Choice) => tasks.filter((task) => task.id !== choice.updatesTaskId).map((task) => task.name);
  const problems = choices.map((choice) => choice.selected ? nameProblem(choice.name, [...otherTaskNames(choice), ...chosen.filter((other) => other !== choice).map((other) => other.name)]) : "");
  const lastSearch = discoveredAt && new Date(discoveredAt).toLocaleString();
  const namesValid = problems.every((problem) => !problem);

  const save = () => run("saving", async () => {
    const result = await onSave(chosen.map(({ selected, ...capability }) => capability));
    const skipped = result.skipped ?? [];
    if (skipped.length) {
      setChoices(chosen.filter((choice) => skipped.includes(choice.name)));
      const one = skipped.length === 1;
      throw new Error(`MCParrot did not save ${skipped.join(", ")}, because ${one ? "its" : "their"} name or requests match another tool in this app. Rename ${one ? "it" : "them"}, or untick ${one ? "it" : "them"}.`);
    }
    const saved = result.saved ?? [];
    if (saved.length) setChoices(choices.filter((choice) => !(choice.selected && saved.includes(choice.name))));
    if (result.error !== undefined) throw new Error(result.error || "MCParrot could not save these tools. Try again.");
    setChoices([]);
  });

  useEffect(() => {
    if (!active) return;
    const refresh = () => void refreshStatus();
    window.addEventListener("focus", refresh);
    refresh();
    return () => window.removeEventListener("focus", refresh);
  }, [active, appId]);

  useEffect(() => {
    if (active && choices.length === 0 && busy === "") void showLastDiscovery();
  }, [active, appId]);

  const otherAppExploring = !!state.activeAppId && state.activeAppId !== appId;

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
      {connected && <button className="button primary" disabled={busy !== ""} onClick={() => operate(state.recording || otherAppExploring ? "stop" : "start")}>{busy === "exploration" ? "Updating exploration…" : state.recording ? "Stop exploring" : otherAppExploring ? "Stop the other exploration" : state.requests.length ? "Continue exploring" : "Open website and explore"}</button>}
      <button className="button" disabled={busy !== ""} onClick={() => operate("status")}>{connected ? "Refresh" : "Check extension"}</button>
      {connected && <span role="status">{state.requests.length} data requests recorded{state.recording ? " · Exploring" : ""}</span>}
    </div>
    {connected && otherAppExploring && <p className="field-help">MCParrot Explorer is exploring another app. Stop that exploration to explore this one.</p>}
    {connected && state.saveError && <p className="pilot-error">{state.saveError}</p>}
    {!state.recording && state.requests.length > 0 && <div className="pilot-candidates">
      <details className="teaching-details">
        <summary>Recorded requests · {state.requests.length}</summary>
        <div className="candidate-list">
          {state.requests.map((request) => <div className="candidate-button" key={`${request.method} ${request.pattern}`}><span>{request.method} {request.pattern}<small>{request.status} · {request.contentType}</small></span></div>)}
        </div>
      </details>
      <p className="field-help">Cookies, sign-in traffic, sign-in codes, and headers other than a few safe ones, such as accept, are not recorded; for a sign-in code, only its header name and where the page stores it are kept. Selecting Find what this site can do sends these requests and their short samples to an AI that finds what the site can do.</p>
      <div className="pilot-controls">
        <button className="button primary" disabled={busy !== ""} onClick={discover}>{busy === "discovery" ? "Finding what this site can do…" : "Find what this site can do"}</button>
        <button className="button" disabled={busy !== ""} onClick={clearRequests}>Delete recorded requests</button>
      </div>
    </div>}
    {lastSearch && choices.length === 0 && <p className="field-help">The last search, on {lastSearch}, found nothing new to save.</p>}
    {choices.length > 0 && <div className="pilot-candidates">
      <h3>Choose the tools to keep</h3>
      <p className="field-help">Found on {lastSearch}. Find what this site can do again for a new list.</p>
      <div className="capability-list">{choices.map((choice, index) => <CapabilityChoice key={index} choice={choice} updatedTask={tasks.find((task) => task.id === choice.updatesTaskId)} problem={problems[index]} problemId={`${appId}-task-name-${index}`} onChange={(changes) => changeChoice(index, changes)} />)}</div>
      <p className="field-help">Saving adds new tools, replaces each tool that an update changes, and skips ones that match another tool. Saved tools appear in this app’s ChatGPT connection.</p>
      <div className="pilot-controls"><button className="button primary" disabled={busy !== "" || chosen.length === 0 || !namesValid} onClick={save}>{busy === "saving" ? "Saving tools…" : `Save ${chosen.length} ${chosen.length === 1 ? "tool" : "tools"}`}</button>{!namesValid && <span className="field-help">Fix the tool names above to save.</span>}</div>
    </div>}
    {error && <p className="pilot-error" role="alert">{error}</p>}
  </section>;
}
