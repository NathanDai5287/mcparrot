"use client";

import { UserButton } from "@clerk/nextjs";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ExplorationPanel, requestExtension, type SaveResult } from "./exploration-panel";
import { AssistantPanel, stopStoredSignIn } from "./assistant-panel";
import { ImagePanel } from "./image-panel";
import { OrderingPanel } from "./ordering-panel";
import { PublishPanel } from "./publish-panel";
import type { Capability, DiscoveredCapability, Task, TaskRequest, Website } from "../lib/capabilities";
import type { WorkspaceOperation } from "../lib/workspace";

type Screen =
  | { view: "apps" }
  | { view: "create-app" }
  | { view: "missing" }
  | { view: "app"; app: Website }
  | { view: "explore"; app: Website };

type WorkspaceResult = { apps: Website[]; error?: undefined } | { apps?: undefined; error: string };

const storageWarning = "MCParrot cannot reach its storage, so your apps may not load or save. Reload the page to try again.";
const signedOutWarning = "Your MCParrot sign-in has ended. Reload the page to sign in again.";
const shownErrorStatuses = [403, 404, 409, 413, 503];

const requestsText = (requests: TaskRequest[]) => requests.map(({ method, urlPattern, bodyPattern = "" }) => `${method} ${urlPattern} ${bodyPattern}`).join("\n");
const savedAs = (task: Task | undefined, capability: Capability) => task?.name === capability.name && requestsText(task.requests) === requestsText(capability.requests);

function screenTitle(screen: Screen) {
  if (screen.view === "app") return `${screen.app.name} — MCParrot`;
  if (screen.view === "explore") return `Explore ${screen.app.name} — MCParrot`;
  if (screen.view === "create-app") return "Create an app — MCParrot";
  if (screen.view === "missing") return "App not found — MCParrot";
  return "MCParrot — Workspace";
}

function screenPath(screen: Screen) {
  if (screen.view === "apps" || screen.view === "missing") return "/";
  if (screen.view === "create-app") return "/apps/new";
  const appPath = `/apps/${screen.app.id}`;
  if (screen.view === "explore") return `${appPath}/explore`;
  return appPath;
}

function screenAtPath(apps: Website[]): Screen {
  const path = window.location.pathname.replace(/\/$/, "");
  if (!path) return { view: "apps" };
  if (path === "/apps/new") return { view: "create-app" };
  const parts = path.split("/");
  const app = apps.find((candidate) => candidate.id === parts[2]);
  if (parts[1] !== "apps" || !app) return { view: "missing" };
  if (parts.length === 3) return { view: "app", app };
  if (parts[3] === "explore" && parts.length === 4) return { view: "explore", app };
  return { view: "missing" };
}

function Icon({ name }: { name: "apps" | "arrow" | "plus" | "browser" | "trash" }) {
  const paths = {
    apps: "M3 3h5v5H3zM12 3h5v5h-5zM3 12h5v5H3zM12 12h5v5h-5z",
    arrow: "m7 4 6 6-6 6",
    plus: "M10 4v12M4 10h12",
    browser: "M3 7h14M6 5h.01M9 5h.01M4 3h12a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z",
    trash: "M3.5 5.5h13M8 5.5V4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5M5 5.5l.8 10.6a1 1 0 0 0 1 .9h6.4a1 1 0 0 0 1-.9L15 5.5M8.5 9v4.5M11.5 9v4.5",
  };
  return <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d={paths[name]} /></svg>;
}

function PageHeader({ title, description, action, children }: { title: string; description: string; action?: ReactNode; children?: ReactNode }) {
  return <header className="page-header"><div><h1 tabIndex={-1}>{title}</h1><p>{description}</p>{children}</div>{action}</header>;
}

const toolFilterThreshold = 8;

function AppStatus({ app }: { app: Website }) {
  return <ul className="status-chips" aria-label="Status">
    <li className={app.signedInAt ? "status-chip on" : "status-chip"}>{app.signedInAt ? "Signed in" : "Not signed in"}</li>
    {app.loginSavedAt && <li className="status-chip on">Login saved</li>}
    {app.ordering?.enabled && <li className="status-chip on">Ordering on</li>}
  </ul>;
}

function ToolItem({ tool, open, onToggle, onDelete }: { tool: Task; open: boolean; onToggle: () => void; onDelete: () => void }) {
  const detailsId = `tool-${tool.id}`;
  return <li className="tool">
    <button className="tool-row" aria-expanded={open} aria-controls={detailsId} onClick={onToggle}><span className="tool-name">{tool.name}</span><span className="tool-summary">{tool.description}</span><Icon name="arrow" /></button>
    {open && <div className="tool-details" id={detailsId}>
      <p>{tool.description}</p>
      <dl className="tool-facts">
        <dt>Inputs</dt><dd>{tool.inputs.length === 0 ? "None" : <ul>{tool.inputs.map((input) => <li key={input.name}><span className="tool-input-name">{input.name}</span> {input.description}</li>)}</ul>}</dd>
        <dt>Returns</dt><dd>{tool.returns}</dd>
        <dt>Answer fields</dt><dd>{tool.keepFields?.length ? tool.keepFields.join(", ") : "All"}</dd>
        <dt>Requests</dt><dd><ul>{tool.requests.map((request, index) => <li key={index}><span className="tool-input-name">Step {index + 1}: {request.method}</span> {request.urlPattern}{request.bodyPattern && ` with body ${request.bodyPattern}`}</li>)}</ul></dd>
      </dl>
      <button className="delete-link" aria-label={`Delete ${tool.name}`} onClick={onDelete}>Delete tool</button>
    </div>}
  </li>;
}

function ToolList({ app, onDelete }: { app: Website; onDelete: (toolId: string) => Promise<string> }) {
  const [query, setQuery] = useState("");
  const [openToolId, setOpenToolId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState("");
  if (app.tasks.length === 0) return <section className="empty-state"><h3>Start by exploring</h3><p>Browse the pages you use, then let MCParrot find what this site can do. Choose the tools to keep.</p></section>;
  const filterShown = app.tasks.length > toolFilterThreshold;
  const search = filterShown ? query.trim().toLowerCase() : "";
  const shownTools = app.tasks.filter((tool) => `${tool.name} ${tool.description}`.toLowerCase().includes(search));
  return <>
    {deleteError && <p className="pilot-error" role="alert">{deleteError}</p>}
    {filterShown && <input className="tool-filter" type="search" aria-label="Filter tools" placeholder="Filter tools by name or description" value={query} onChange={(event) => setQuery(event.target.value)} />}
    {shownTools.length === 0 ? <p className="tool-empty" role="status">No tools match “{query.trim()}”.</p> : <ul className="tool-list">{shownTools.map((tool) => <ToolItem key={tool.id} tool={tool} open={openToolId === tool.id} onToggle={() => setOpenToolId(openToolId === tool.id ? null : tool.id)} onDelete={async () => setDeleteError(await onDelete(tool.id))} />)}</ul>}
  </>;
}

function DeleteAppButton({ app, busy, error, onDelete, onClose }: { app: Website; busy: boolean; error: string; onDelete: () => void; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const keepButton = useRef<HTMLButtonElement>(null);
  const toolCount = `${app.tasks.length} ${app.tasks.length === 1 ? "tool" : "tools"}`;
  return <>
    <button className="button delete-app" onClick={() => { dialog.current?.showModal(); keepButton.current?.focus(); }}><Icon name="trash" />Delete app</button>
    <dialog ref={dialog} className="confirm-dialog" aria-labelledby="delete-app-title" onCancel={(event) => { if (busy) event.preventDefault(); }} onClose={onClose}>
      <h2 id="delete-app-title">Delete {app.name}?</h2>
      <p>This removes from MCParrot:</p>
      <ul>
        <li>The app and its {toolCount}</li>
        {app.loginSavedAt && <li>Its saved login</li>}
        {app.connectionTokenHash && <li>Its ChatGPT link, so ChatGPT can no longer use this app</li>}
        {app.listing && <li>Its marketplace listing</li>}
        <li>Its recorded requests in MCParrot Explorer</li>
      </ul>
      <p>Your account on the website is not affected.</p>
      <div className="form-actions"><button className="button danger" disabled={busy} onClick={onDelete}>{busy ? "Deleting…" : "Delete app"}</button><button className="button" ref={keepButton} disabled={busy} onClick={() => dialog.current?.close()}>Keep app</button></div>
      {error && <p className="pilot-error" role="alert">{error}</p>}
    </dialog>
  </>;
}

function ScreenLink({ screen, onNavigate, className, current, children }: { screen: Screen; onNavigate: (screen: Screen) => void; className?: string; current?: boolean; children: ReactNode }) {
  return <a className={className} href={screenPath(screen)} aria-current={current ? "page" : undefined} onClick={(event) => { if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); onNavigate(screen); }}>{children}</a>;
}

function Breadcrumb({ trail, current, onNavigate }: { trail: { label: string; screen: Screen }[]; current: string; onNavigate: (screen: Screen) => void }) {
  return <nav className="breadcrumb" aria-label="Breadcrumb"><ol>
    {trail.map(({ label, screen }) => <li key={screenPath(screen)}><ScreenLink screen={screen} onNavigate={onNavigate}>{label}</ScreenLink></li>)}
    <li aria-current="page">{current}</li>
  </ol></nav>;
}

function AppForm({ onSave, onCancel }: { onSave: (name: string, url: string) => Promise<string>; onCancel: () => void }) {
  const saving = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving.current) return;
    const fields = new FormData(event.currentTarget);
    saving.current = true;
    setBusy(true);
    setError("");
    const problem = await onSave(String(fields.get("name")).trim(), String(fields.get("url")).trim());
    saving.current = false;
    setBusy(false);
    setError(problem);
  }

  return (
    <form className="editor" onSubmit={submit}>
      <label htmlFor="app-name">App name</label>
      <input id="app-name" name="name" placeholder="For example, Course portal" required maxLength={80} pattern=".*\S.*" autoFocus />
      <label htmlFor="website-url">Website address</label>
      <input id="website-url" name="url" type="url" pattern="https?://.+" placeholder="https://your-website.com" required aria-describedby="url-help" />
      <p className="field-help" id="url-help">Use the address you normally visit in your browser, starting with https:// or http://.</p>
      {error && <p className="pilot-error" role="alert">{error}</p>}
      <div className="form-actions"><button className="button primary" type="submit" disabled={busy}>{busy ? "Creating app…" : "Create app"}</button><button className="button" type="button" onClick={onCancel}>Cancel</button></div>
    </form>
  );
}

export default function Workspace() {
  const [apps, setApps] = useState<Website[]>([]);
  const [screen, setScreen] = useState<Screen>({ view: "apps" });
  const [loaded, setLoaded] = useState(false);
  const [warning, setWarning] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const focusHeading = useRef(false);
  const [isOwner, setIsOwner] = useState(false);

  useEffect(() => {
    fetch("/api/workspace").then(async (response) => {
      const workspace: { apps?: Website[] | null; isOwner?: boolean } | null = await response.json().catch(() => null);
      if (!response.ok || !workspace || !(workspace.apps === null || Array.isArray(workspace.apps))) {
        setWarning(response.status === 404 && !workspace ? signedOutWarning : storageWarning);
        return;
      }
      const savedApps = workspace.apps ?? [];
      setIsOwner(workspace.isOwner === true);
      setApps(savedApps);
      setScreen(screenAtPath(savedApps));
      setLoaded(true);
    }).catch(() => setWarning(storageWarning));
  }, []);

  useEffect(() => {
    const restoreScreen = () => {
      focusHeading.current = true;
      setScreen(screenAtPath(apps));
      setDeleteError("");
    };
    window.addEventListener("popstate", restoreScreen);
    return () => window.removeEventListener("popstate", restoreScreen);
  }, [apps]);

  useEffect(() => {
    document.title = screenTitle(screen);
  }, [screen]);

  useEffect(() => {
    if (!focusHeading.current) return;
    focusHeading.current = false;
    const headings = document.querySelectorAll<HTMLElement>("#main-content h1");
    [...headings].find((heading) => !heading.closest("[hidden]"))?.focus();
  }, [screen]);

  function navigate(nextScreen: Screen, replace = false) {
    const path = screenPath(nextScreen);
    if (path !== window.location.pathname) {
      if (replace) window.history.replaceState(null, "", path);
      else window.history.pushState(null, "", path);
    }
    focusHeading.current = true;
    setScreen(nextScreen);
    setDeleteError("");
  }

  async function deleteApp(app: Website) {
    setDeleteBusy(true);
    setDeleteError("");
    await stopStoredSignIn(app.id);
    const login = await fetch(`/api/login?appId=${encodeURIComponent(app.id)}`, { method: "DELETE" }).catch(() => null);
    if (login?.ok) updateApp(app.id, { loginSavedAt: undefined });
    const saved = login?.ok ? await changeWorkspace({ operation: "deleteApp", appId: app.id }) : null;
    if (saved?.apps) await requestExtension("clear", app.id).catch(() => undefined);
    setDeleteBusy(false);
    if (!saved?.apps) {
      setDeleteError(saved ? `MCParrot deleted this app’s saved login but could not delete the app. ${saved.error || "Try again."}` : "MCParrot could not delete this app’s saved login, so it kept the app. Try again.");
      return;
    }
    navigate({ view: "apps" }, true);
  }

  async function changeWorkspace(change: WorkspaceOperation): Promise<WorkspaceResult> {
    const response = await fetch("/api/workspace", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(change) }).catch(() => null);
    const result: { apps?: unknown; error?: unknown } | null = await response?.json().catch(() => null) ?? null;
    if (response?.ok && Array.isArray(result?.apps)) {
      setWarning("");
      showApps(result.apps);
      return { apps: result.apps };
    }
    if (response?.status === 404 && !result) {
      setWarning(signedOutWarning);
      return { error: signedOutWarning };
    }
    setWarning(!response || response.ok || response.status === 503 ? storageWarning : "");
    return { error: response && shownErrorStatuses.includes(response.status) && typeof result?.error === "string" ? result.error : "" };
  }

  function showApps(savedApps: Website[]) {
    setApps(savedApps);
    setLoaded(true);
    setScreen((current) => "app" in current ? { ...current, app: savedApps.find((app) => app.id === current.app.id) ?? current.app } : current);
  }

  async function createApp(name: string, url: string) {
    if (!URL.canParse(url) || !["http:", "https:"].includes(new URL(url).protocol)) return "Use a website address that starts with https:// or http://.";
    const app: Website = { id: crypto.randomUUID(), name, url, tasks: [] };
    const saved = await changeWorkspace({ operation: "createApp", app });
    const savedApp = saved.apps?.find((candidate) => candidate.id === app.id);
    if (!savedApp) return saved.error || "MCParrot could not create the app. Try again.";
    navigate({ view: "app", app: savedApp });
    return "";
  }

  async function saveTasks(app: Website, capabilities: DiscoveredCapability[]): Promise<SaveResult> {
    const skipped: string[] = [];
    let savedApp: Website | undefined = app;
    for (const { updatesTaskId, ...capability } of capabilities) {
      if (!updatesTaskId) continue;
      const saved = await changeWorkspace({ operation: "replaceTask", appId: app.id, taskId: updatesTaskId, capability });
      if (!saved.apps) return { error: saved.error };
      savedApp = saved.apps.find((candidate) => candidate.id === app.id);
      if (!savedAs(savedApp?.tasks.find((task) => task.id === updatesTaskId), capability)) skipped.push(capability.name);
    }
    const newCapabilities = capabilities.filter((capability) => !capability.updatesTaskId);
    if (newCapabilities.length) {
      const earlierTaskIds = new Set(savedApp?.tasks.map((task) => task.id));
      const saved = await changeWorkspace({ operation: "addTasks", appId: app.id, capabilities: newCapabilities });
      if (!saved.apps) return { error: saved.error };
      savedApp = saved.apps.find((candidate) => candidate.id === app.id);
      const addedTasks = savedApp?.tasks.filter((task) => !earlierTaskIds.has(task.id)) ?? [];
      for (const capability of newCapabilities) if (!addedTasks.some((task) => savedAs(task, capability))) skipped.push(capability.name);
    }
    if (!savedApp) return { error: "This app no longer exists. It may have been deleted." };
    if (skipped.length) return { skipped };
    navigate({ view: "app", app: savedApp });
    return {};
  }

  function updateApp(appId: string, changes: Partial<Website>) {
    setApps((savedApps) => savedApps.map((app) => app.id === appId ? { ...app, ...changes } : app));
    setScreen((current) => "app" in current && current.app.id === appId ? { ...current, app: { ...current.app, ...changes } } : current);
  }

  const currentApp = "app" in screen ? screen.app : null;

  return (
    <div className="workspace-shell">
      <aside className="sidebar">
        <button className="wordmark" onClick={() => navigate({ view: "apps" })} aria-label="MCParrot home">
          <img src="/logo.svg" width={29} height={29} alt="" />
          <span>MCParrot</span>
        </button>
        <button className="sidebar-apps-link" onClick={() => navigate({ view: "apps" })}>Apps</button>
        <div className="sidebar-apps">
          <div className="sidebar-apps-heading"><h2>Apps {loaded && <span>{apps.length}</span>}</h2><button className="sidebar-icon-button" aria-label="Create app" onClick={() => navigate({ view: "create-app" })}><Icon name="plus" /></button></div>
          {loaded && apps.length === 0 && <p className="sidebar-empty">No apps yet</p>}
          <nav aria-label="Apps" className="sidebar-app-list">{apps.map((app) => <ScreenLink className="sidebar-app" key={app.id} current={currentApp?.id === app.id} screen={{ view: "app", app }} onNavigate={navigate}>
            <span className="sidebar-app-mark" aria-hidden="true">{app.name.charAt(0).toUpperCase()}</span>
            <span className="sidebar-app-name">{app.name}</span>
            <span className={app.signedInAt ? "status-dot signed-in" : "status-dot"}><span className="visually-hidden">{app.signedInAt ? "Signed in" : "Not signed in"}</span></span>
          </ScreenLink>)}</nav>
        </div>
        <div className="sidebar-footer">
          <a className="sidebar-link" href="/marketplace">Marketplace</a>
          <UserButton />
        </div>
      </aside>
      <div className="page">
        <main id="main-content">
          {warning && <p className="workspace-warning" role="status">{warning}</p>}
          {loaded && screen.view === "missing" && <><PageHeader title="App not found" description="It may have been deleted." /><button className="button" onClick={() => navigate({ view: "apps" }, true)}>All apps</button></>}

          {loaded && screen.view === "apps" && <>
            <PageHeader title="Your apps" description="One website. Many tools for your assistant." action={<button className="button primary" onClick={() => navigate({ view: "create-app" })}><Icon name="plus" />Create app</button>} />
            <div className="section-heading"><h2>Websites <span>{apps.length}</span></h2><span>Choose a website to explore</span></div>
            <div className="app-list">{apps.map((app) => <ScreenLink className="app-row" key={app.id} screen={{ view: "app", app }} onNavigate={navigate}>
              <span className={`app-mark ${app.id}`}>{app.name.charAt(0).toUpperCase()}</span>
              <span className="app-main"><span className="app-name">{app.name}</span><span className="website-address">{app.url}</span></span>
              <span className="app-status">{app.signedInAt ? "Signed in" : "Not signed in"}<small>{app.tasks.length === 0 ? "No tools yet" : `${app.tasks.length} ${app.tasks.length === 1 ? "tool" : "tools"}`}</small></span><Icon name="arrow" />
            </ScreenLink>)}</div>
            <p className="preview-note">MCParrot stores apps and chosen tools so your assistant can use them. Recorded requests stay in MCParrot Explorer.</p>
          </>}
          {screen.view === "create-app" && <>
            <Breadcrumb trail={[{ label: "Apps", screen: { view: "apps" } }]} current="Create an app" onNavigate={navigate} />
            <PageHeader title="Create an app" description="Start with the website you want your assistant to use." />
            <AppForm onSave={createApp} onCancel={() => navigate({ view: "apps" })} />
          </>}
          {screen.view === "app" && <>
            <Breadcrumb trail={[{ label: "Apps", screen: { view: "apps" } }]} current={screen.app.name} onNavigate={navigate} />
            <PageHeader title={screen.app.name} description={screen.app.url} action={<div className="page-actions"><DeleteAppButton key={screen.app.id} app={screen.app} busy={deleteBusy} error={deleteError} onDelete={() => deleteApp(screen.app)} onClose={() => setDeleteError("")} /><ScreenLink className="button primary" screen={{ view: "explore", app: screen.app }} onNavigate={navigate}><Icon name="browser" />Explore website</ScreenLink></div>}><AppStatus app={screen.app} /></PageHeader>
            <div className="app-layout">
              <section className="app-tools" aria-labelledby="app-tools-heading">
                <div className="section-heading"><h2 id="app-tools-heading">What ChatGPT can do on {screen.app.name} <span>{screen.app.tasks.length} {screen.app.tasks.length === 1 ? "tool" : "tools"}</span></h2><span>Explore, find what the site can do, then choose</span></div>
                <ToolList key={screen.app.id} app={screen.app} onDelete={async (toolId) => { const saved = await changeWorkspace({ operation: "deleteTask", appId: screen.app.id, taskId: toolId }); return saved.apps ? "" : saved.error || "MCParrot could not delete this tool. Try again."; }} />
              </section>
              <aside className="setup-rail" aria-label="Setup">
                <AssistantPanel key={screen.app.id} app={screen.app} onChange={(changes) => updateApp(screen.app.id, changes)} onAutomaticSignIn={(automaticSignIn) => changeWorkspace({ operation: "setAutomaticSignIn", appId: screen.app.id, automaticSignIn })} onApps={showApps} />
                <PublishPanel key={`publish-${screen.app.id}`} app={screen.app} onApps={showApps} />
                <ImagePanel key={`image-${screen.app.id}`} app={screen.app} />
                {isOwner && <OrderingPanel key={`ordering-${screen.app.id}`} app={screen.app} onSave={async (ordering) => (await changeWorkspace({ operation: "setOrdering", appId: screen.app.id, ordering })).apps} />}
              </aside>
            </div>
          </>}
          {apps.map((app) => <div key={`explore-${app.id}`} hidden={screen.view !== "explore" || screen.app.id !== app.id}>
            <Breadcrumb trail={[{ label: "Apps", screen: { view: "apps" } }, { label: app.name, screen: { view: "app", app } }]} current="Explore" onNavigate={navigate} />
            <PageHeader title={`Explore ${app.name}`} description="Browse the pages you use, find what this site can do, then choose the tools to keep." />
            <ExplorationPanel appId={app.id} websiteUrl={app.url} tasks={app.tasks} active={screen.view === "explore" && screen.app.id === app.id} onSave={(capabilities) => saveTasks(app, capabilities)} />
            <div className="teaching-actions"><p>MCParrot Explorer keeps recorded requests on your computer for 30 days, or until you delete them. Tools you save show up in ChatGPT for this app.</p><button className="button" onClick={() => navigate({ view: "app", app })}>Return to app</button></div>
          </div>)}

        </main>
      </div>
    </div>
  );
}
