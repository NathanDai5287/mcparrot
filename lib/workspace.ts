import { Redis } from "@upstash/redis";
import type { Capability, Website } from "./capabilities";

const workspaceKey = "workspace";

export type WorkspaceOperation =
  | { operation: "createApp"; app: Website }
  | { operation: "deleteApp"; appId: string }
  | { operation: "addTasks"; appId: string; capabilities: Capability[] }
  | { operation: "deleteTask"; appId: string; taskId: string };

export const readWorkspace = () => Redis.fromEnv().get<Website[]>(workspaceKey);

export async function changeApps(change: (apps: Website[]) => Website[]) {
  const apps = change(await readWorkspace() ?? []);
  await Redis.fromEnv().set(workspaceKey, apps);
  return apps;
}

export const changeApp = (appId: string, change: (app: Website) => Website) =>
  changeApps((apps) => apps.map((app) => app.id === appId ? change(app) : app));

export const updateStoredApp = (appId: string, changes: Partial<Website>) => changeApp(appId, (app) => ({ ...app, ...changes }));
