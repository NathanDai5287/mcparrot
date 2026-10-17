"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { TeachingPanel } from "./teaching-panel";

type Task = { id: string; name: string; description: string };
type Website = { id: string; name: string; url: string; sample?: boolean; tasks: Task[] };
type Screen =
  | { view: "apps" }
  | { view: "create-app" }
  | { view: "missing" }
  | { view: "app"; app: Website }
  | { view: "create-task"; app: Website }
  | { view: "teach"; app: Website; task: Task };

const sampleApps: Website[] = [
  { id: "canvas", name: "Canvas", url: "https://bcourses.berkeley.edu", sample: true, tasks: [] },
  { id: "youtube", name: "YouTube", url: "https://www.youtube.com", sample: true, tasks: [] },
];

const workspaceStorageKey = "mcparrot-workspace-v1";

function screenPath(screen: Screen) {
  if (screen.view === "apps" || screen.view === "missing") return "/";
  if (screen.view === "create-app") return "/apps/new";
  const appPath = `/apps/${screen.app.id}`;
  if (screen.view === "create-task") return `${appPath}/tasks/new`;
  if (screen.view === "teach") return `${appPath}/tasks/${screen.task.id}`;
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
  if (parts[3] !== "tasks" || parts.length !== 5) return { view: "missing" };
  if (parts[4] === "new") return { view: "create-task", app };
  const task = app.tasks.find((candidate) => candidate.id === parts[4]);
  return task ? { view: "teach", app, task } : { view: "missing" };
}

function isWorkspace(value: unknown): value is Website[] {
  if (!Array.isArray(value)) return false;
  return value.every((app) => typeof app.id === "string" && typeof app.name === "string"
    && typeof app.url === "string" && Array.isArray(app.tasks)
    && app.tasks.every((task: Task) => typeof task.id === "string"
      && typeof task.name === "string" && typeof task.description === "string"));
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
  return <header className="page-header"><div><h1>{title}</h1><p>{description}</p></div>{action}</header>;
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
      <input id="app-name" name="name" placeholder="For example, Canvas" required maxLength={80} pattern=".*\S.*" autoFocus />
      <label htmlFor="website-url">Website address</label>
      <input id="website-url" name="url" type="url" placeholder="https://your-website.com" required aria-describedby="url-help" />
      <p className="field-help" id="url-help">Use the address you normally visit. The local teaching pilot supports Berkeley Canvas.</p>
      <div className="form-actions"><button className="button primary" type="submit">Create app</button><button className="button" type="button" onClick={onCancel}>Cancel</button></div>
    </form>
  );
}

function TaskForm({ app, onSave, onCancel }: { app: Website; onSave: (task: Task) => void; onCancel: () => void }) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    onSave({ id: crypto.randomUUID(), name: String(fields.get("name")).trim(), description: String(fields.get("description")).trim() });
  }

  return (
    <form className="editor" onSubmit={submit}>
      <label htmlFor="task-name">Task name</label>
      <input id="task-name" name="name" placeholder="For example, List upcoming assignments" required maxLength={100} pattern=".*\S.*" autoFocus />
      <label htmlFor="task-description">What does this task do?</label>
      <textarea id="task-description" name="description" placeholder={`Describe the steps you want to demonstrate on ${app.name}.`} required rows={4} />
      <p className="field-help">You will perform the task yourself during teaching.</p>
      <div className="form-actions"><button className="button primary" type="submit">Continue to teaching</button><button className="button" type="button" onClick={onCancel}>Cancel</button></div>
    </form>
  );
}

export default function Workspace() {
  const [apps, setApps] = useState(sampleApps);
  const [screen, setScreen] = useState<Screen>({ view: "apps" });
  const [loaded, setLoaded] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [deletingAppId, setDeletingAppId] = useState<string | null>(null);

  useEffect(() => {
    let savedApps = sampleApps;
    try {
      const stored = localStorage.getItem(workspaceStorageKey);
      const saved: unknown = stored ? JSON.parse(stored) : sampleApps;
      if (isWorkspace(saved)) savedApps = saved;
    } catch {
      setStorageError(true);
    }
    setApps(savedApps);
    setScreen(screenAtPath(savedApps));
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(workspaceStorageKey, JSON.stringify(apps));
    } catch {
      setStorageError(true);
    }
    const restoreScreen = () => {
      setScreen(screenAtPath(apps));
      setDeletingAppId(null);
    };
    window.addEventListener("popstate", restoreScreen);
    return () => window.removeEventListener("popstate", restoreScreen);
  }, [apps, loaded]);

  function navigate(nextScreen: Screen, replace = false) {
    const path = screenPath(nextScreen);
    if (path !== window.location.pathname) {
      if (replace) window.history.replaceState(null, "", path);
      else window.history.pushState(null, "", path);
    }
    setScreen(nextScreen);
    setDeletingAppId(null);
  }

  function deleteApp(app: Website) {
    setApps(apps.filter((savedApp) => savedApp.id !== app.id));
    navigate({ view: "apps" }, true);
  }

  function createApp(name: string, url: string) {
    const app: Website = { id: crypto.randomUUID(), name, url, tasks: [] };
    setApps([...apps, app]);
    navigate({ view: "app", app });
  }

  function saveDraft(app: Website, task: Task) {
    const remainingTasks = app.tasks.filter((savedTask) => savedTask.id !== task.id);
    const updatedApp = { ...app, tasks: [...remainingTasks, task] };
    setApps(apps.map((savedApp) => savedApp.id === app.id ? updatedApp : savedApp));
    navigate({ view: "app", app: updatedApp });
  }

  const currentApp = "app" in screen ? screen.app : null;

  return (
    <div className="workspace-shell">
      <aside className="sidebar">
        <button className="wordmark" onClick={() => navigate({ view: "apps" })} aria-label="MCParrot home">
          <svg width="29" height="29" viewBox="0 0 29 29" fill="none" aria-hidden="true"><rect x="1" y="1" width="27" height="27" rx="8" /><path d="M8 18V10l6.5 6 6.5-6v8" /></svg>
          <span>MCParrot</span>
        </button>
        <p className="workspace-label">Personal workspace</p>
        <nav aria-label="Workspace"><button className="nav-item" onClick={() => navigate({ view: "apps" })}><Icon name="apps" />Apps</button></nav>
        <div className="sidebar-footer"><span className="avatar">N</span><div>Nathan’s workspace</div></div>
      </aside>
      <div className="page">
        <div className="topbar"><span>Workspace <span className="slash">/</span> {currentApp?.name ?? "Apps"}</span></div>
        <main id="main-content">
          {storageError && <p className="workspace-warning" role="status">This browser cannot save your drafts. Keep this page open to retain your changes.</p>}
          {loaded && screen.view === "missing" && <><PageHeader title="App or task not found" description="It may have been deleted, or saved in another browser." /><button className="button" onClick={() => navigate({ view: "apps" }, true)}>All apps</button></>}

          {screen.view === "apps" && <>
            <PageHeader title="Your apps" description="One website. Many tasks for your assistant." action={<button className="button primary" onClick={() => navigate({ view: "create-app" })}><Icon name="plus" />Create app</button>} />
            <div className="section-heading"><h2>Websites <span>{apps.length}</span></h2><span>Choose an app to add a task</span></div>
            <div className="app-list">{apps.map((app) => <button className="app-row" key={app.id} onClick={() => navigate({ view: "app", app })}>
              <span className={`app-mark ${app.id}`}>{app.name.charAt(0).toUpperCase()}</span>
              <span className="app-main"><span className="app-name">{app.name} {app.sample && <span className="badge">Sample</span>}</span><span className="website-address">{app.url}</span></span>
              <span className="app-status">Not connected<small>{app.tasks.length === 0 ? "No tasks yet" : `${app.tasks.length} draft ${app.tasks.length === 1 ? "task" : "tasks"}`}</small></span><Icon name="arrow" />
            </button>)}</div>
            <p className="preview-note">Apps and draft names stay in this browser. Website sign-in and recordings stay with your teaching browser.</p>
          </>}
          {screen.view === "create-app" && <>
            <BackButton onClick={() => navigate({ view: "apps" })}>All apps</BackButton>
            <PageHeader title="Create an app" description="Start with the website you want your assistant to use." />
            <AppForm onSave={createApp} onCancel={() => navigate({ view: "apps" })} />
          </>}
          {screen.view === "app" && <>
            <BackButton onClick={() => navigate({ view: "apps" })}>All apps</BackButton>
            <PageHeader title={screen.app.name} description={screen.app.url} action={<button className="button primary" onClick={() => navigate({ view: "create-task", app: screen.app })}><Icon name="plus" />Create task</button>} />
            <div className="section-heading"><h2>Tasks <span>{screen.app.tasks.length}</span></h2><span>Not connected</span></div>
            {screen.app.tasks.length === 0 ? <section className="empty-state"><h3>What would you like to teach?</h3><p>Create a task, then demonstrate its steps on the website.</p><button className="button" onClick={() => navigate({ view: "create-task", app: screen.app })}>Create your first task</button></section> : <div className="app-list">{screen.app.tasks.map((task) => <button className="task-row" key={task.id} onClick={() => navigate({ view: "teach", app: screen.app, task })}><span className="app-main"><span className="app-name">{task.name}</span><span className="website-address">{task.description}</span></span><span className="badge">Draft</span><Icon name="arrow" /></button>)}</div>}
            <section className="app-settings">
              {deletingAppId !== screen.app.id ? <button className="delete-link" onClick={() => setDeletingAppId(screen.app.id)}>Delete app</button> : <div role="group" aria-label="Confirm app deletion">
                <h2>Delete {screen.app.name}?</h2>
                <p>This removes this app and its drafts from this browser. Your website account and teaching browser stay intact.</p>
                <div className="form-actions"><button className="button danger" onClick={() => deleteApp(screen.app)}>Delete app and drafts</button><button className="button" onClick={() => setDeletingAppId(null)}>Keep app</button></div>
              </div>}
            </section>
            <section className="assistant-section"><div><h2>Use tasks in your assistant</h2><p>Assistant connections will be available after teaching and testing are built.</p></div><button className="button" disabled>Connect assistant</button></section>
          </>}
          {screen.view === "create-task" && <>
            <BackButton onClick={() => navigate({ view: "app", app: screen.app })}>{screen.app.name}</BackButton>
            <PageHeader title="Create a task" description={`What would you like to do on ${screen.app.name}?`} />
            <TaskForm app={screen.app} onSave={(task) => {
              const app = { ...screen.app, tasks: [...screen.app.tasks, task] };
              setApps(apps.map((savedApp) => savedApp.id === app.id ? app : savedApp));
              navigate({ view: "teach", app, task });
            }} onCancel={() => navigate({ view: "app", app: screen.app })} />
          </>}
          {apps.flatMap((app) => app.tasks.map((task) => <div key={task.id} hidden={screen.view !== "teach" || screen.task.id !== task.id}>
            <BackButton onClick={() => navigate({ view: "app", app })}>{app.name}</BackButton>
            <PageHeader title={task.name} description={task.description} />
            <TeachingPanel />
            <div className="teaching-actions"><p>Draft names stay in this browser. Teaching is not connected yet. This is not an assistant tool.</p><button className="button" onClick={() => saveDraft(app, task)}>Return to tasks</button></div>
          </div>))}

        </main>
      </div>
    </div>
  );
}
