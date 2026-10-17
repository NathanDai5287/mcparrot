"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Candidate = { id: string; label: string; kind: string };
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
      if (event.data?.type === "mcparrot-teaching-ready") { setConnected(true); setMessage("Connected. Your current recording is available below when this task owns it."); return; }
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
    setMessage(popup.current ? "Select Connect to MCParrot in the local connection window." : "Allow popups for this site, then select Connect again.");
  }

  async function run(name: string, inputs = {}) {
    setBusy(true);
    setMessage("");
    if (name === "test_saved_request" || name === "test_mcp_tool") setTestResult("");
    try {
      const result = await request(name, inputs);
      if (name === "start_recording") onClaimRecording();
      if (name === "start_recording" || name === "review_recording") setTestResult("");
      if (result.success) setTestResult(name === "test_mcp_tool" ? "Local MCP test passed." : "Direct request test passed.");
      setState(result);
      if (result.saved) setCourseId(result.courseId);
      if (result.success) setMessage("Test passed. The saved reading request ran without browser navigation.");
      if (name === "start_recording") setMessage("Recording. Browse Canvas pages in the teaching window, then stop here.");
      if (name === "stop_recording") setMessage("Recording stopped. Choose an observed request below to test.");
      if (name === "review_recording") setMessage("Request selected. Check the course ID, then test it.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "The teaching action failed."); }
    finally { setBusy(false); }
  }

  return <section className="teaching-pilot" aria-label="Local teaching pilot">
    <div className="section-heading"><h2>Teach by browsing</h2><span className="badge">Local pilot</span></div>
    <p>Browse several pages once. Review the reading requests we observe, then test each request before using it.</p>
    <p className="field-help">This pilot connects to your computer. Your school session and page content stay there. It does not discover pages you have not visited.</p>
    {!supported ? <p className="pilot-status">This pilot supports Berkeley Canvas. Create an app with https://bcourses.berkeley.edu to try it.</p> : <>
      <ol className="pilot-steps"><li>Connect your local teaching browser.</li><li>Start recording, then open Canvas pages such as Assignments or Syllabus.</li><li>Stop recording and test the observed requests below.</li></ol>
      <div className="pilot-controls"><button className="button primary" disabled={busy} onClick={connect}>{connected ? "Reconnect browser" : "Connect teaching browser"}</button>{connected && <button className="button" disabled={busy} onClick={() => run("focus_teaching_browser")}>Show Canvas</button>}</div>
      {!connected && <p className="field-help">The local teaching worker must run on this computer. If the connection window cannot load, start it with <code>npm run browser:teach</code>.</p>}
      {connected && <>
        {!ownsRecording && <p className="field-help">This task has no current recording. Starting a new recording replaces the worker’s previous capture. Earlier task summaries remain visible, but cannot be tested again.</p>}
        <div className="pilot-controls"><button className="button primary" disabled={busy || (ownsRecording && state?.recording)} onClick={() => run("start_recording")}>Start recording</button><button className="button" disabled={busy || (!ownsRecording || !state?.recording)} onClick={() => run("stop_recording")}>Stop recording</button></div>
        <p className="pilot-status">{state?.recording && ownsRecording ? "Recording" : "Stopped"} · {state?.capturedRequests ?? 0} observed requests</p>
      </>}
      {state && <p className="pilot-status">Saved page-session summary: {state.capturedRequests} observed requests{state.saved ? " · request selected" : ""}.</p>}
        {state && !state.recording && state.candidates.length > 0 && <div className="pilot-candidates"><h3>Observed reading requests</h3><p className="field-help">These are request candidates, not ready-made tasks. Names and task inputs still need review.</p>{state.candidates.map((candidate) => <button className="button candidate-button" key={candidate.id} disabled={busy || !connected || !ownsRecording} onClick={() => run("review_recording", { requestId: candidate.id })}>{candidate.kind === "syllabus" ? "Syllabus page" : candidate.label}</button>)}</div>}
        {state?.saved && <div className="pilot-review"><h3>Selected request</h3><p>{testResult || "No test result is recorded in this page session."}</p><p className="field-help">Your selection stays available when you leave this task and return during this page session.</p>{state.courseId && <label>Course ID<input value={courseId} onChange={(event) => { setCourseId(event.target.value); setTestResult(""); }} inputMode="numeric" pattern="[0-9]+" /></label>}<div className="pilot-controls"><button className="button primary" disabled={busy || !connected || !ownsRecording} onClick={() => run("test_saved_request", { courseId })}>Test request</button><button className="button" disabled={busy || !connected || !ownsRecording} onClick={() => run("test_mcp_tool", { courseId })}>Test local MCP operation</button></div></div>}
    </>}
    <p className="pilot-status" role="status" aria-live="polite">{message}</p>
    <p className="field-help">Task details stay visible while this page remains open. Refreshing loses draft tasks. Captures stay in worker memory until another recording starts or the worker stops. Hosted task storage and remote assistant connections are not connected.</p>
  </section>;
}
