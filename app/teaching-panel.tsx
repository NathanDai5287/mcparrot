"use client";

import { useEffect, useState } from "react";

type Candidate = { id: string; label: string; kind: string; courseId: string };
type TeachingState = {
  ready: boolean; recording: boolean; candidates: Candidate[]; liveUrl?: string; expiresAt?: number;
  lastTest?: { requestId: string; courseId: string; changedInput: boolean; success: boolean; resultCount: number | null };
};
const emptyState: TeachingState = { ready: false, recording: false, candidates: [] };

export function TeachingPanel({ appId, taskId, websiteUrl, active }: { appId: string; taskId: string; websiteUrl: string; active: boolean }) {
  const [state, setState] = useState<TeachingState>(emptyState);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [courseId, setCourseId] = useState("");
  const [testFailed, setTestFailed] = useState(false);
  const supported = new URL(websiteUrl).origin === "https://bcourses.berkeley.edu";

  async function operate(name: string, input?: object) {
    setBusy(true);
    setError("");
    if (name === "test_saved_request") setTestFailed(true);
    try {
      const response = await fetch("/api/teaching", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, appId, taskId, arguments: input }) });
      const next = await response.json();
      if (!response.ok) {
        if (next.hasSession) setState((previous) => ({ ...previous, expiresAt: next.expiresAt }));
        throw new Error(next.error ?? "The teaching action failed.");
      }
      setState(next);
      if (name === "test_saved_request") setTestFailed(false);
      if (!next.candidates.some((candidate: Candidate) => candidate.id === selectedId)) {
        setSelectedId(next.candidates[0]?.id ?? "");
        setCourseId(next.candidates[0]?.courseId ?? "");
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The teaching action failed.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!active || !supported) return;
    void operate("get_teaching_status");
  }, [active, appId, taskId]);

  if (!supported) return <section className="teaching-pilot"><h2>Start with Berkeley Canvas</h2><p>This first hosted reading test supports Berkeley Canvas. Other websites still need recording support.</p></section>;

  const step = !state.ready ? "connect" : state.recording || state.candidates.length === 0 ? "teach" : "review";
  const selected = state.candidates.find(({ id }) => id === selectedId);

  return <section className="teaching-pilot" aria-label="Teach this task" aria-busy={busy}>
    <ol className="teaching-progress"><li aria-current={step === "connect" ? "step" : undefined}>Connect</li><li aria-current={step === "teach" ? "step" : undefined}>Teach</li><li aria-current={step === "review" ? "step" : undefined}>Review</li></ol>
    {!state.ready && <div className="teaching-step">
      <h2>Open your teaching browser</h2>
      <p>Sign in to Canvas in the browser below. Nothing runs on your computer.</p>
      <button className="button primary" disabled={busy} onClick={() => operate("create_teaching_session")}>{busy ? "Opening hosted browser…" : "Connect Canvas"}</button>
      <p className="field-help">This private pilot uses your Browser Use credits. Each session ends after 30 minutes.</p>
    </div>}
    {state.ready && <>
      <div className="teaching-step">
        <h2>{state.recording ? "Show us the pages you use" : state.candidates.length ? "Review what we observed" : "Sign in, then start recording"}</h2>
        <p>{state.recording ? "Browse Assignments, Syllabus, or other course reading pages below. Stop when you finish." : state.candidates.length ? "Choose one reading request and test it without navigating Canvas again." : "Complete Canvas sign-in and Duo below. Start recording only after you reach Canvas."}</p>
        <div className="pilot-controls">
          {state.recording ? <button className="button primary" disabled={busy} onClick={() => operate("stop_recording")}>Stop recording</button> : state.candidates.length === 0 && <button className="button primary" disabled={busy} onClick={() => operate("start_recording")}>Start recording</button>}
          <span>{state.recording ? "Recording course reading requests" : `${state.candidates.length} observed requests`}</span>
        </div>
      </div>
      {state.candidates.length > 0 && !state.recording && <div className="pilot-candidates">
        <label htmlFor={`request-${taskId}`}>Suggested reading task</label>
        <select id={`request-${taskId}`} value={selectedId} onChange={(event) => { setSelectedId(event.target.value); setCourseId(state.candidates.find(({ id }) => id === event.target.value)?.courseId ?? ""); }}>
          {state.candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.label} · course {candidate.courseId}</option>)}
        </select>
        <div className="pilot-controls"><button className="button primary" disabled={busy || !selected} onClick={() => operate("test_saved_request", { requestId: selectedId, courseId })}>{busy ? "Testing request…" : "Test reading request"}</button></div>
        {!testFailed && !busy && state.lastTest?.requestId === selectedId && state.lastTest.courseId === courseId && <p className="pilot-status" role="status">Reading test passed{state.lastTest.resultCount !== null ? `: ${state.lastTest.resultCount} results` : ": syllabus page received"}. {state.lastTest.changedInput ? "Changed course input tested." : "The original course was tested."}</p>}
      </div>}
      {state.liveUrl && <iframe className="teaching-browser" src={state.liveUrl} title="Your hosted Canvas teaching browser" allow="autoplay; clipboard-read; clipboard-write" referrerPolicy="no-referrer" />}
      <details className="teaching-details"><summary>Session details</summary>
        <p>This session and its observed requests remain available here until the session ends. Only reading requests are supported.</p>
        <p>Task publication and assistant connections are not available yet.</p>
        {selected && <label htmlFor={`course-${taskId}`}>Test another course ID<input id={`course-${taskId}`} inputMode="numeric" pattern="[0-9]+" value={courseId} onChange={(event) => setCourseId(event.target.value)} /></label>}
        <div className="pilot-controls"><button className="button" disabled={busy} onClick={() => operate("get_teaching_status")}>Refresh status</button><button className="button" disabled={busy} onClick={() => { setSelectedId(""); void operate("start_recording"); }}>Replace recording</button><button className="button" disabled={busy} onClick={() => operate("end_teaching_session")}>End session and delete captures</button></div>
      </details>
    </>}
    {!state.ready && state.expiresAt && <div className="pilot-controls"><p>The browser connection ended. Close this session before opening another.</p><button className="button" disabled={busy} onClick={() => operate("end_teaching_session")}>End session</button></div>}
    {error && <p className="pilot-error" role="alert">{error}</p>}
  </section>;
}
