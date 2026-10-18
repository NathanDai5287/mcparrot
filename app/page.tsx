"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ExplorationPanel, requestExtension } from "./exploration-panel";
import { AssistantPanel } from "./assistant-panel";
import type { Capability, Website } from "../lib/capabilities";
import type { WorkspaceOperation } from "../lib/workspace";

type Screen =
  | { view: "apps" }
  | { view: "create-app" }
  | { view: "missing" }
  | { view: "app"; app: Website }
  | { view: "explore"; app: Website };

function screenPath(screen: Screen) {
  if (screen.view === "apps" || screen.view === "missing") return "/";
  if (screen.view === "create-app") return "/apps/new";
  const appPath = `/apps/${screen.app.id}`;
  if (screen.view === "explore") return `${appPath}/explore`;
  return appPath;
}

const focusOnMount = (node: HTMLElement | null) => node?.focus();

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

function Icon({ name }: { name: "apps" | "arrow" | "plus" | "back" | "browser" }) {
  const paths = {
    apps: "M3 3h5v5H3zM12 3h5v5h-5zM3 12h5v5H3zM12 12h5v5h-5z",
    arrow: "m7 4 6 6-6 6",
    plus: "M10 4v12M4 10h12",
    back: "m10 4-6 6 6 6M4 10h12",
    browser: "M3 7h14M6 5h.01M9 5h.01M4 3h12a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z",
  };
  return <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d={paths[name]} /></svg>;
}

function PageHeader({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <header className="page-header"><div><h1 tabIndex={-1}>{title}</h1><p>{description}</p></div>{action}</header>;
}

function BackButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return <button className="back-button" onClick={onClick}><Icon name="back" />{children}</button>;
}

function AppForm({ onSave, onCancel }: { onSave: (name: string, url: string) => void; onCancel: () => void }) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    onSave(String(fields.get("name")).trim(), String(fields.get("url")).trim());
  }

  return (
    <form className="editor" onSubmit={submit}>
      <label htmlFor="app-name">App name</label>
      <input id="app-name" name="name" placeholder="For example, Course portal" required maxLength={80} pattern=".*\S.*" autoFocus />
      <label htmlFor="website-url">Website address</label>
      <input id="website-url" name="url" type="url" pattern="https?://.+" placeholder="https://your-website.com" required aria-describedby="url-help" />
      <p className="field-help" id="url-help">Use the address you normally visit in your browser, starting with https:// or http://.</p>
      <div className="form-actions"><button className="button primary" type="submit">Create app</button><button className="button" type="button" onClick={onCancel}>Cancel</button></div>
    </form>
  );
}

export default function Workspace() {
  const [apps, setApps] = useState<Website[]>([]);
  const [screen, setScreen] = useState<Screen>({ view: "apps" });
  const [loaded, setLoaded] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [deletingAppId, setDeletingAppId] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const focusHeading = useRef(false);
  const restoreDeleteFocus = useRef(false);
  const deleteAppButton = useCallback((node: HTMLButtonElement | null) => {
    if (!node || !restoreDeleteFocus.current) return;
    restoreDeleteFocus.current = false;
    node.focus();
  }, []);
  const [connectionSecret, setConnectionSecret] = useState<string>();

  useEffect(() => {
    fetch("/api/workspace").then(async (response) => {
      if (!response.ok) throw new Error("Storage is unavailable.");
      const workspace: { apps: Website[] | null; connectionSecret?: string } = await response.json();
      const savedApps = workspace.apps ?? [];
      setConnectionSecret(workspace.connectionSecret);
      setApps(savedApps);
      setScreen(screenAtPath(savedApps));
      setLoaded(true);
    }).catch(() => setStorageError(true));
  }, []);

  useEffect(() => {
    const restoreScreen = () => {
      setScreen(screenAtPath(apps));
      setDeletingAppId(null);
      setDeleteError("");
    };
    window.addEventListener("popstate", restoreScreen);
    return () => window.removeEventListener("popstate", restoreScreen);
  }, [apps]);

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
    setDeletingAppId(null);
    setDeleteError("");
  }

  async function deleteApp(app: Website) {
    setDeleteBusy(true);
    setDeleteError("");
    const login = await fetch(`/api/login?appId=${encodeURIComponent(app.id)}`, { method: "DELETE" }).catch(() => null);
    if (login?.ok) updateApp(app.id, { loginSavedAt: undefined });
    const savedApps = login?.ok ? await changeWorkspace({ operation: "deleteApp", appId: app.id }) : null;
    if (savedApps) await requestExtension("clear", app.id).catch(() => undefined);
    setDeleteBusy(false);
    if (!savedApps) {
      setDeleteError(login?.ok ? "MCParrot deleted this app’s saved login but could not delete the app. Try again." : "MCParrot could not delete this app’s saved login, so it kept the app. Try again.");
      return;
    }
    navigate({ view: "apps" }, true);
  }

  async function changeWorkspace(change: WorkspaceOperation) {
    const response = await fetch("/api/workspace", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(change) }).catch(() => null);
    setStorageError(!response?.ok);
    if (!response?.ok) return null;
    const { apps: savedApps }: { apps: Website[] } = await response.json();
    setApps(savedApps);
    setScreen((current) => "app" in current ? { ...current, app: savedApps.find((app) => app.id === current.app.id) ?? current.app } : current);
    return savedApps;
  }

  async function createApp(name: string, url: string) {
    if (!URL.canParse(url) || !["http:", "https:"].includes(new URL(url).protocol)) return;
    const app: Website = { id: crypto.randomUUID(), name, url, tasks: [] };
    const savedApps = await changeWorkspace({ operation: "createApp", app }) ?? apps;
    navigate({ view: "app", app: savedApps.find((savedApp) => savedApp.id === app.id) ?? app });
  }

  async function saveTasks(app: Website, capabilities: Capability[]) {
    const savedApps = await changeWorkspace({ operation: "addTasks", appId: app.id, capabilities });
    if (!savedApps) return false;
    navigate({ view: "app", app: savedApps.find((savedApp) => savedApp.id === app.id) ?? app });
    return true;
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
          <svg width="29" height="29" viewBox="0 0 29 29" fill="none" aria-hidden="true"><rect x="1" y="1" width="27" height="27" rx="8" /><path d="M8 18V10l6.5 6 6.5-6v8" /></svg>
          <span>MCParrot</span>
        </button>
        <button className="sidebar-apps-link" onClick={() => navigate({ view: "apps" })}>Apps</button>
        <div className="sidebar-apps">
          <div className="sidebar-apps-heading"><h2>Apps {loaded && <span>{apps.length}</span>}</h2><button className="sidebar-icon-button" aria-label="Create app" onClick={() => navigate({ view: "create-app" })}><Icon name="plus" /></button></div>
          {loaded && apps.length === 0 && <p className="sidebar-empty">No apps yet</p>}
          <nav aria-label="Apps" className="sidebar-app-list">{apps.map((app) => <button className="sidebar-app" key={app.id} aria-current={currentApp?.id === app.id ? "page" : undefined} onClick={() => navigate({ view: "app", app })}>
            <span className="sidebar-app-mark" aria-hidden="true">{app.name.charAt(0).toUpperCase()}</span>
            <span className="sidebar-app-name">{app.name}</span>
            <span className={app.signedInAt ? "status-dot signed-in" : "status-dot"}><span className="visually-hidden">{app.signedInAt ? "Signed in" : "Not signed in"}</span></span>
          </button>)}</nav>
        </div>
      </aside>
      <div className="page">
        <div className="topbar"><span>Workspace <span className="slash">/</span> {currentApp?.name ?? "Apps"}</span></div>
        <main id="main-content">
          {storageError && <p className="workspace-warning" role="status">MCParrot cannot reach its storage, so your apps may not load or save. Reload the page to try again.</p>}
          {loaded && screen.view === "missing" && <><PageHeader title="App not found" description="It may have been deleted." /><button className="button" onClick={() => navigate({ view: "apps" }, true)}>All apps</button></>}

          {loaded && screen.view === "apps" && <>
            <PageHeader title="Your apps" description="One website. Many tasks for your assistant." action={<button className="button primary" onClick={() => navigate({ view: "create-app" })}><Icon name="plus" />Create app</button>} />
            <div className="section-heading"><h2>Websites <span>{apps.length}</span></h2><span>Choose a website to explore</span></div>
            <div className="app-list">{apps.map((app) => <button className="app-row" key={app.id} onClick={() => navigate({ view: "app", app })}>
              <span className={`app-mark ${app.id}`}>{app.name.charAt(0).toUpperCase()}</span>
              <span className="app-main"><span className="app-name">{app.name}</span><span className="website-address">{app.url}</span></span>
              <span className="app-status">{app.signedInAt ? "Signed in" : "Not signed in"}<small>{app.tasks.length === 0 ? "No tasks yet" : `${app.tasks.length} ${app.tasks.length === 1 ? "task" : "tasks"}`}</small></span><Icon name="arrow" />
            </button>)}</div>
            <p className="preview-note">MCParrot stores apps and chosen tasks so your assistant can use them. Recorded requests stay in MCParrot Explorer.</p>
          </>}
          {screen.view === "create-app" && <>
            <BackButton onClick={() => navigate({ view: "apps" })}>All apps</BackButton>
            <PageHeader title="Create an app" description="Start with the website you want your assistant to use." />
            <AppForm onSave={createApp} onCancel={() => navigate({ view: "apps" })} />
          </>}
          {screen.view === "app" && <>
            <BackButton onClick={() => navigate({ view: "apps" })}>All apps</BackButton>
            <PageHeader title={screen.app.name} description={screen.app.url} action={<button className="button primary" onClick={() => navigate({ view: "explore", app: screen.app })}><Icon name="browser" />Explore website</button>} />
            <div className="section-heading"><h2>Tasks <span>{screen.app.tasks.length}</span></h2><span>Explore, find what the site can do, then choose</span></div>
            {screen.app.tasks.length === 0 ? <section className="empty-state"><h3>Start by exploring</h3><p>Browse the pages you use, then let MCParrot find what this site can do. Choose the tasks to keep.</p></section> : <div className="app-list">{screen.app.tasks.map((task) => <div className="task-row" key={task.id}><span className="app-main"><span className="app-name">{task.name}</span><span className="website-address">{task.description}</span><span className="website-address">Inputs: {task.inputs.map((input) => input.name).join(", ") || "none"} · Returns: {task.returns}</span></span><button className="delete-link" aria-label={`Delete ${task.name}`} onClick={() => changeWorkspace({ operation: "deleteTask", appId: screen.app.id, taskId: task.id })}>Delete</button></div>)}</div>}
            <AssistantPanel key={screen.app.id} app={screen.app} connectionSecret={connectionSecret} onChange={(changes) => updateApp(screen.app.id, changes)} />
            <section className="app-settings">
              {deletingAppId !== screen.app.id ? <button className="delete-link" ref={deleteAppButton} onClick={() => setDeletingAppId(screen.app.id)}>Delete app</button> : <div role="group" aria-label="Confirm app deletion">
                <h2 tabIndex={-1} ref={focusOnMount}>Delete {screen.app.name}?</h2>
                <p>This removes this app and its tasks from MCParrot and deletes its recorded requests in MCParrot Explorer. Your website account stays intact.</p>
                <div className="form-actions"><button className="button danger" disabled={deleteBusy} onClick={() => deleteApp(screen.app)}>{deleteBusy ? "Deleting…" : "Delete app and tasks"}</button><button className="button" disabled={deleteBusy} onClick={() => { restoreDeleteFocus.current = true; setDeletingAppId(null); setDeleteError(""); }}>Keep app</button></div>
                {deleteError && <p className="pilot-error" role="alert">{deleteError}</p>}
              </div>}
            </section>
          </>}
          {apps.map((app) => <div key={`explore-${app.id}`} hidden={screen.view !== "explore" || screen.app.id !== app.id}>
            <BackButton onClick={() => navigate({ view: "app", app })}>{app.name}</BackButton>
            <PageHeader title={`Explore ${app.name}`} description="Browse the pages you use, find what this site can do, then choose the tasks to keep." />
            <ExplorationPanel appId={app.id} websiteUrl={app.url} taskNames={app.tasks.map((task) => task.name)} active={screen.view === "explore" && screen.app.id === app.id} onSave={(capabilities) => saveTasks(app, capabilities)} />
            <div className="teaching-actions"><p>Recorded requests stay in MCParrot Explorer until you delete them. Saved reading tasks become tools in this app’s ChatGPT connection.</p><button className="button" onClick={() => navigate({ view: "app", app })}>Return to app</button></div>
          </div>)}

        </main>
      </div>
    </div>
  );
}
