"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

type Candidate = { id: string; label: string; kind: string; courseId: string };
type TeachingState = {
  ready: boolean; recording: boolean; candidates: Candidate[]; liveUrl?: string; expiresAt?: number;
  authentication?: { stage: string; message: string; rejected?: boolean };
  lastTest?: { requestId: string; courseId: string; changedInput: boolean; success: boolean; resultCount: number | null };
};
const emptyState: TeachingState = { ready: false, recording: false, candidates: [] };

function interactiveBrowserUrl(liveUrl: string) {
  const url = new URL(liveUrl);
  url.searchParams.set("readOnly", "false");
  return url.href;
}

export function CloudTeachingPanel({ appId, taskId, websiteUrl, active }: { appId: string; taskId: string; websiteUrl: string; active: boolean }) {
  const [state, setState] = useState<TeachingState>(emptyState);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [courseId, setCourseId] = useState("");
  const [testFailed, setTestFailed] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");
  const browserWindow = useRef<Window | null>(null);

  async function operate(name: string, input?: object) {
    setBusy(true);
    setError("");
    if (name === "test_saved_request") setTestFailed(true);
    try {
      const response = await fetch("/api/teaching", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, appId, taskId, websiteUrl, arguments: input }) });
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
      return next as TeachingState;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The teaching action failed.");
    } finally {
      setBusy(false);
    }
  }

  function openBrowser(url = "about:blank") {
    if (browserWindow.current && !browserWindow.current.closed) {
      browserWindow.current.focus();
      return browserWindow.current;
    }
    const teachingWindow = window.open(url, `mcparrot-teaching-${appId}-${taskId}`, "popup,width=1440,height=1000");
    if (!teachingWindow) {
      setError("Allow popups for MCParrot, then select the browser button again.");
      return;
    }
    teachingWindow.opener = null;
    browserWindow.current = teachingWindow;
    teachingWindow.focus();
    return teachingWindow;
  }

  async function submitVerification(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = verificationCode;
    setVerificationCode("");
    await operate("submit_signin_code", { code });
  }

  useEffect(() => {
    if (!active) return;
    void operate("get_teaching_status");
  }, [active, appId, taskId]);

  const step = !state.ready ? "connect" : state.recording || state.candidates.length === 0 ? "teach" : "review";
  const selected = state.candidates.find(({ id }) => id === selectedId);
  const liveUrl = state.liveUrl ? interactiveBrowserUrl(state.liveUrl) : undefined;
  const authentication = state.authentication;
  const verificationRequired = authentication?.stage === "verification_required";

  return <section className="teaching-pilot" aria-label="Explore website and review reading actions" aria-busy={busy}>
    <ol className="teaching-progress"><li aria-current={step === "connect" ? "step" : undefined}>Connect</li><li aria-current={step === "teach" ? "step" : undefined}>Explore</li><li aria-current={step === "review" ? "step" : undefined}>Review</li></ol>
    {!state.ready && <div className="teaching-step">
      <h2>No earlier cloud session is connected</h2>
      <p>Use the extension above to explore this website. New cloud exploration sessions are not opened here.</p>
    </div>}
    {state.ready && <>
      <div className="teaching-step">
        <h2>{state.recording ? "Explore the pages you use" : state.candidates.length ? "Review what we observed" : authentication?.stage === "signed_in" ? "The website is ready" : "Continue sign-in"}</h2>
        <p>{state.recording ? "Visit the pages you use in the teaching browser window. Return here when you are ready to review." : state.candidates.length ? "Review all observed reading actions below. Select each action to test it without opening the website again." : authentication?.stage === "signed_in" ? "Use the normal-browser exploration above for new observations. This older session remains available for sign-in recovery and earlier reading tests." : "We can enter your saved sign-in details when automatic sign-in is configured. You complete any text-code check here."}</p>
        <div className="pilot-controls">
          {liveUrl && <button className="button" onClick={() => openBrowser(liveUrl)}>Open teaching browser</button>}
          {state.recording && <button className="button primary" disabled={busy} onClick={() => operate("stop_recording")}>Stop earlier recording</button>}
          <span>{state.recording ? "Recording reading requests" : `${state.candidates.length} observed requests`}</span>
        </div>
      </div>
      {!state.recording && state.candidates.length === 0 && authentication?.stage !== "signed_in" && <div className="pilot-review">
        {authentication && <p role="status">{authentication.message}</p>}
        {verificationRequired ? <form onSubmit={submitVerification} className="verification-form">
          <label htmlFor={`verification-${appId}-${taskId}`}>Text verification code</label>
          <input id={`verification-${appId}-${taskId}`} value={verificationCode} onChange={(event) => setVerificationCode(event.target.value)} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,10}" minLength={6} maxLength={10} required />
          <button className="button primary" disabled={busy} type="submit">{busy ? "Checking code…" : "Submit code"}</button>
        </form> : <button className="button primary" disabled={busy} onClick={() => operate("continue_signin")}>{busy ? "Continuing sign-in…" : authentication ? "Check sign-in" : "Sign in automatically"}</button>}
        {verificationRequired && <button className="button" disabled={busy} onClick={() => operate("continue_signin")}>Check sign-in</button>}
        <p className="field-help">You can also continue manually in the teaching browser window. We never approve your phone verification for you.</p>
      </div>}
      {state.candidates.length > 0 && !state.recording && <div className="pilot-candidates">
        <h3>Observed reading actions · {state.candidates.length}</h3>
        <p className="field-help">These are captured requests, not finished tools. Similar requests can appear more than once.</p>
        <div className="candidate-list" role="group" aria-label="Choose an observed reading action">
          {state.candidates.map((candidate) => <button className="candidate-button" key={candidate.id} disabled={busy} aria-pressed={selectedId === candidate.id} onClick={() => { setSelectedId(candidate.id); setCourseId(candidate.courseId); }}>
            <span>{candidate.label}<small>Course {candidate.courseId}</small></span><span className="candidate-action">{selectedId === candidate.id ? "Selected for test" : "Select to test"}</span>
          </button>)}
        </div>
        <div className="pilot-controls"><button className="button primary" disabled={busy || !selected} onClick={() => operate("test_saved_request", { requestId: selectedId, courseId })}>{busy ? "Testing request…" : `${selected?.label ?? "Reading action"}: test request`}</button></div>
        {!testFailed && !busy && state.lastTest?.requestId === selectedId && state.lastTest.courseId === courseId && <p className="pilot-status" role="status">Reading test passed{state.lastTest.resultCount !== null ? `: ${state.lastTest.resultCount} results` : ": syllabus page received"}. {state.lastTest.changedInput ? "Changed course input tested." : "The original course was tested."}</p>}
      </div>}
      <details className="teaching-details"><summary>Session details</summary>
        <p>This session and its observed requests remain available here until the session ends. Only reading requests are supported.</p>
        <p>Task publication and assistant connections are not available yet. Use the extension above for new exploration.</p>
        {selected && <label htmlFor={`course-${appId}-${taskId}`}>Test another course ID<input id={`course-${appId}-${taskId}`} inputMode="numeric" pattern="[0-9]+" value={courseId} onChange={(event) => setCourseId(event.target.value)} /></label>}
        <div className="pilot-controls"><button className="button" disabled={busy} onClick={() => operate("get_teaching_status")}>Refresh status</button><button className="button" disabled={busy || state.recording} onClick={() => operate("continue_signin")}>Check sign-in</button><button className="button" disabled={busy} onClick={() => operate("end_teaching_session")}>End session and delete captures</button></div>
      </details>
    </>}
    {!state.ready && state.expiresAt && <div className="pilot-controls"><p>The earlier browser connection ended. End this session and use the extension above for exploration.</p><button className="button" disabled={busy} onClick={() => operate("end_teaching_session")}>End session</button></div>}
    {error && <p className="pilot-error" role="alert">{error}</p>}
  </section>;
}
