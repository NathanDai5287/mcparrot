"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Candidate = { id: string; label: string; kind: string };

function requestName(candidate: Candidate) {
  if (candidate.kind === "syllabus") return "Syllabus";
  const resource = candidate.label.split("/")[5];
  if (!resource) return "Course information";
  return resource.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}
type TeachingState = { recording: boolean; capturedRequests: number; ready: boolean; saved: boolean; courseId: string; candidates: Candidate[]; success?: boolean; resultCount?: number | null };
type WorkerReply = TeachingState & { error?: string };
type PendingRequest = { resolve: (value: WorkerReply) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };
const workerOrigin = "http://127.0.0.1:4323";

export function TeachingPanel({ websiteUrl, active, ownsRecording, canRecoverRecording, onClaimRecording }: { websiteUrl: string; active: boolean; ownsRecording: boolean; canRecoverRecording: boolean; onClaimRecording: () => void }) {
  const popup = useRef<Window | null>(null);
  const pendingRequests = useRef(new Map<string, PendingRequest>());
  const [connected, setConnected] = useState(false);
  const [state, setState] = useState<TeachingState | null>(null);
  const [message, setMessage] = useState("");
  const [courseId, setCourseId] = useState("");
  const [busy, setBusy] = useState(false);
  const [testResult, setTestResult] = useState("");
  const supported = new URL(websiteUrl).hostname === "bcourses.berkeley.edu";

  const request = useCallback((name: string, inputs = {}): Promise<WorkerReply> => {
    return new Promise((resolve, reject) => {
      if (!popup.current || popup.current.closed) return reject(new Error("Reconnect the local teaching browser."));
      const id = crypto.randomUUID();
      const timer = setTimeout(() => {
        pendingRequests.current.delete(id);
        reject(new Error("The local connection did not reply. Keep its window open and reconnect."));
      }, 15000);
      pendingRequests.current.set(id, { resolve, reject, timer });
      popup.current.postMessage({ type: "mcparrot-teaching-command", id, name, arguments: inputs }, workerOrigin);
    });
  }, []);

  useEffect(() => {
    const requests = pendingRequests.current;
    function receive(event: MessageEvent) {
      if (event.origin !== workerOrigin || event.source !== popup.current) return;
      if (event.data?.type === "mcparrot-teaching-ready") { setConnected(true); setMessage(""); window.focus(); return; }
      if (event.data?.type !== "mcparrot-teaching-result") return;
      const pending = requests.get(event.data.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      requests.delete(event.data.id);
      const result = event.data.result as WorkerReply;
      if (result.error) pending.reject(new Error(result.error));
      else pending.resolve(result);
    }
    window.addEventListener("message", receive);
    return () => {
      window.removeEventListener("message", receive);
      for (const pending of requests.values()) clearTimeout(pending.timer);
      requests.clear();
    };
  }, []);

  useEffect(() => {
    if (!connected || !active || !ownsRecording) return;
    let cancelled = false;
    async function refresh() {
      try {
        const result = await request("get_teaching_status");
        if (cancelled) return;
        setState(result);
        if (result.saved) setCourseId((current) => current || result.courseId);
      }
      catch {
        if (cancelled) return;
        setConnected(false);
        setMessage("The local connection closed. Connect again to continue.");
      }
    }
    void refresh();
    const timer = setInterval(refresh, 2000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [connected, active, ownsRecording, request]);

  function connect() {
    if (canRecoverRecording) onClaimRecording();
    setConnected(false);
    popup.current = window.open(`${workerOrigin}/pair?origin=${encodeURIComponent(window.location.origin)}`, "mcparrot-local-teaching", "popup,width=500,height=440");
    setMessage(popup.current ? "Approve the connection in the small helper window, then return here. Keep that window open." : "Allow popups for this site, then select Connect again.");
  }

  async function run(name: string, inputs = {}) {
    setBusy(true);
    setMessage("");
    if (name === "test_saved_request" || name === "test_mcp_tool") setTestResult("");
    try {
      const result = await request(name, inputs);
      if (name === "start_recording") onClaimRecording();
      if (name === "start_recording" || name === "review_recording") setTestResult("");
      if (result.success) setTestResult(name === "test_mcp_tool" ? "Local MCP test passed." : "Reading test passed.");
      setState(result);
      if (result.saved) setCourseId(result.courseId);
      if (result.success) setMessage("Test passed. The saved reading request ran without browser navigation.");
      if (name === "start_recording") {
        setMessage("Recording. Browse Canvas, then return here to finish.");
        await request("focus_teaching_browser");
      }
      if (name === "stop_recording") setMessage(result.capturedRequests ? "Recording finished. Select a captured request below." : "No supported requests were captured. Try teaching again and open Assignments or Syllabus.");
      if (name === "review_recording") setMessage("Request selected. Test it to check whether we can read it again.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "The teaching action failed."); }
    finally { setBusy(false); }
  }

  const hasCapture = Boolean(state && state.capturedRequests > 0);
  const recording = Boolean(ownsRecording && state?.recording);
  const reviewing = hasCapture && !recording;
  const stage = recording ? 1 : reviewing ? 2 : connected ? 1 : 0;
  const canTest = connected && ownsRecording && !busy;
  const loadingCapture = connected && ownsRecording && !state;

  return <section className="teaching-pilot" aria-label="Teach this task" aria-busy={busy}>
    <ol className="teaching-progress" aria-label="Teaching progress">
      {["Connect", "Teach", "Review"].map((label, index) => <li key={label} aria-current={stage === index ? "step" : undefined}>{label}</li>)}
    </ol>
    {!supported ? <div className="teaching-step"><h2>This website needs support</h2><p>The first teaching test supports Berkeley Canvas. Use a Canvas app to try it.</p></div> : <>
      <div className="teaching-step">
        <h2>{loadingCapture ? "Checking your recording…" : recording ? "Show us what you do" : reviewing ? "Your recording" : connected ? "Ready to teach" : "Connect your Canvas browser"}</h2>
        <p>{loadingCapture ? "Your existing recording will appear here. This does not start a new recording." : recording ? "Click through Canvas in its separate window. Return here when you finish." : reviewing ? `${state?.capturedRequests} reading requests captured. Select a request and test whether we can read it again.` : connected ? "Start teaching, then browse the pages you want us to learn in the Canvas window." : "Connect once, then teach by browsing Canvas. You control recording here in MCParrot."}</p>
        {!connected && <>
          <button className="button primary" disabled={busy} onClick={connect}>{hasCapture ? "Reconnect to test" : "Connect Canvas"}</button>
          <p className="field-help">Approve the small connection window and leave it open in the background. Teach in the separate Canvas window.</p>
        </>}
        {connected && !ownsRecording && !canRecoverRecording && !hasCapture && <p className="field-help">Starting this task replaces the previous browser recording.</p>}
        {connected && !recording && !hasCapture && !loadingCapture && <button className={ownsRecording ? "button primary" : "button"} disabled={busy} onClick={() => run("start_recording")}>{busy ? "Opening Canvas…" : ownsRecording ? "Start teaching" : "Replace previous recording"}</button>}
        {recording && <div className="pilot-controls"><button className="button primary" disabled={busy} onClick={() => run("stop_recording")}>{busy ? "Finishing…" : "Finish teaching"}</button><button className="button" disabled={busy} onClick={() => run("focus_teaching_browser")}>Show Canvas</button><span className="recording-status">Recording · {state?.capturedRequests ?? 0} requests</span></div>}
      </div>
      {reviewing && <div className="pilot-candidates">
        <h3>Reading requests</h3>
        {state?.candidates.map((candidate) => <button className="candidate-button" key={candidate.id} disabled={!canTest} onClick={() => run("review_recording", { requestId: candidate.id })}><span>{requestName(candidate)}</span><span className="candidate-action">Select request</span></button>)}
        {state?.saved && <div className="pilot-review">
          <h3>{testResult ? "Test result" : "Request selected"}</h3>
          <p>{testResult || "Test this request before using it again."}</p>
          {state.resultCount != null && testResult && <p className="field-help">{state.resultCount} results returned. This does not publish an assistant tool.</p>}
          {connected && ownsRecording && <button className="button primary" disabled={busy} onClick={() => run("test_saved_request", { courseId })}>{busy ? "Testing…" : testResult ? "Test again" : "Test selected request"}</button>}
        </div>}
        {!ownsRecording && connected && <p className="field-help">This summary belongs to an earlier recording. Its capture has been replaced, so it cannot run another test.</p>}
      </div>}
      {message && <p className="pilot-status" role="status" aria-live="polite">{message}</p>}
      <details className="teaching-details"><summary>Connection and test details</summary>
        <p>{connected ? "Connected to the browser on this computer." : "The teaching helper must run on this computer. Start it with npm run browser:teach if the connection window cannot load."}</p>
        <p>Your school session stays on this computer. Only pages you visit can appear in this recording.</p>
        {connected && <div className="pilot-controls"><button className="button" disabled={busy} onClick={connect}>Reconnect</button>{!recording && hasCapture && <button className="button" disabled={busy} onClick={() => run("focus_teaching_browser")}>Show Canvas</button>}</div>}
        {state?.saved && <>
          {state.courseId && <label>Course ID<input value={courseId} onChange={(event) => { setCourseId(event.target.value); setTestResult(""); }} inputMode="numeric" pattern="[0-9]+" /></label>}
          <button className="button" disabled={!canTest} onClick={() => run("test_mcp_tool", { courseId })}>Test local MCP operation</button>
        </>}
        {connected && !recording && hasCapture && <div className="teaching-restart"><p>A new recording replaces the current capture. Earlier task summaries stay visible but cannot run tests.</p><button className="button" disabled={busy} onClick={() => run("start_recording")}>Replace recording</button></div>}
        <p>Drafts and results stay here until you refresh. The browser helper keeps one capture until it stops or you replace it. Remote assistant connections and lasting task storage are not connected.</p>
      </details>
    </>}
  </section>;
}
