"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { TeachingPanel } from "./teaching-panel";

type Task = { id: string; name: string; description: string };
type Website = { id: string; name: string; url: string; sample?: boolean; tasks: Task[] };
type Screen =
  | { view: "apps" }
  | { view: "create-app" }
  | { view: "app"; app: Website }
  | { view: "create-task"; app: Website }
  | { view: "teach"; app: Website; task: Task };

const sampleApps: Website[] = [
  { id: "canvas", name: "Canvas", url: "https://bcourses.berkeley.edu", sample: true, tasks: [] },
  { id: "youtube", name: "YouTube", url: "https://www.youtube.com", sample: true, tasks: [] },
];

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

  function createApp(name: string, url: string) {
    const app: Website = { id: crypto.randomUUID(), name, url, tasks: [] };
    setApps([...apps, app]);
    setScreen({ view: "app", app });
  }

  function saveDraft(app: Website, task: Task) {
    const remainingTasks = app.tasks.filter((savedTask) => savedTask.id !== task.id);
    const updatedApp = { ...app, tasks: [...remainingTasks, task] };
    setApps(apps.map((savedApp) => savedApp.id === app.id ? updatedApp : savedApp));
    setScreen({ view: "app", app: updatedApp });
  }

  const currentApp = "app" in screen ? screen.app : null;

  return (
    <div className="workspace-shell">
      <aside className="sidebar">
        <button className="wordmark" onClick={() => setScreen({ view: "apps" })} aria-label="MCParrot home">
          <svg width="29" height="29" viewBox="0 0 29 29" fill="none" aria-hidden="true"><rect x="1" y="1" width="27" height="27" rx="8" /><path d="M8 18V10l6.5 6 6.5-6v8" /></svg>
          <span>MCParrot</span>
        </button>
        <p className="workspace-label">Personal workspace</p>
        <nav aria-label="Workspace"><button className="nav-item" onClick={() => setScreen({ view: "apps" })}><Icon name="apps" />Apps</button></nav>
        <div className="sidebar-footer"><span className="avatar">N</span><div>Nathan’s workspace<small>Local preview</small></div></div>
      </aside>
      <div className="page">
        <div className="topbar"><span>Workspace <span className="slash">/</span> {currentApp?.name ?? "Apps"}</span><span className="preview-label">Frontend preview</span></div>
        <main id="main-content">
          {screen.view === "apps" && <>
            <PageHeader title="Your apps" description="One website. Many tasks for your assistant." action={<button className="button primary" onClick={() => setScreen({ view: "create-app" })}><Icon name="plus" />Create app</button>} />
            <div className="section-heading"><h2>Websites <span>{apps.length}</span></h2><span>Choose an app to add a task</span></div>
            <div className="app-list">{apps.map((app) => <button className="app-row" key={app.id} onClick={() => setScreen({ view: "app", app })}>
              <span className={`app-mark ${app.id}`}>{app.name.charAt(0).toUpperCase()}</span>
              <span className="app-main"><span className="app-name">{app.name} {app.sample && <span className="badge">Sample</span>}</span><span className="website-address">{app.url}</span></span>
              <span className="app-status">Not connected<small>{app.tasks.length === 0 ? "No tasks yet" : `${app.tasks.length} draft ${app.tasks.length === 1 ? "task" : "tasks"}`}</small></span><Icon name="arrow" />
            </button>)}</div>
            <p className="preview-note">Try creating an app and a draft task. Changes reset when you refresh.</p>
          </>}
          {screen.view === "create-app" && <>
            <BackButton onClick={() => setScreen({ view: "apps" })}>All apps</BackButton>
            <PageHeader title="Create an app" description="Start with the website you want your assistant to use." />
            <AppForm onSave={createApp} onCancel={() => setScreen({ view: "apps" })} />
          </>}
          {screen.view === "app" && <>
            <BackButton onClick={() => setScreen({ view: "apps" })}>All apps</BackButton>
            <PageHeader title={screen.app.name} description={screen.app.url} action={<button className="button primary" onClick={() => setScreen({ view: "create-task", app: screen.app })}><Icon name="plus" />Create task</button>} />
            <div className="section-heading"><h2>Tasks <span>{screen.app.tasks.length}</span></h2><span>Not connected</span></div>
            {screen.app.tasks.length === 0 ? <section className="empty-state"><h3>What would you like to teach?</h3><p>Create a task, then demonstrate its steps on the website.</p><button className="button" onClick={() => setScreen({ view: "create-task", app: screen.app })}>Create your first task</button></section> : <div className="app-list">{screen.app.tasks.map((task) => <button className="task-row" key={task.id} onClick={() => setScreen({ view: "teach", app: screen.app, task })}><span className="app-main"><span className="app-name">{task.name}</span><span className="website-address">{task.description}</span></span><span className="badge">Draft</span><Icon name="arrow" /></button>)}</div>}
            <section className="assistant-section"><div><h2>Use tasks in your assistant</h2><p>Assistant connections will be available after teaching and testing are built.</p></div><button className="button" disabled>Connect assistant</button></section>
          </>}
          {screen.view === "create-task" && <>
            <BackButton onClick={() => setScreen({ view: "app", app: screen.app })}>{screen.app.name}</BackButton>
            <PageHeader title="Create a task" description={`What would you like to do on ${screen.app.name}?`} />
            <TaskForm app={screen.app} onSave={(task) => setScreen({ view: "teach", app: screen.app, task })} onCancel={() => setScreen({ view: "app", app: screen.app })} />
          </>}
          {screen.view === "teach" && <>
            <BackButton onClick={() => setScreen({ view: "app", app: screen.app })}>{screen.app.name}</BackButton>
            <PageHeader title={screen.task.name} description={screen.task.description} />
            <TeachingPanel key={screen.task.id} websiteUrl={screen.app.url} />
            <div className="teaching-actions"><p>Saving this draft does not publish the local recording or connect an assistant.</p><button className="button primary" onClick={() => saveDraft(screen.app, screen.task)}>Save draft</button></div>
          </>}
        </main>
      </div>
    </div>
  );
}
