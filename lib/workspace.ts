import * as Sentry from "@sentry/nextjs";
import { Redis } from "@upstash/redis";
import { z } from "zod";
import { appIdSchema, capabilitySchema, maxApps, maxTasksPerApp, storedWebsiteSchema, websiteSchema, type Website } from "./capabilities";

const workspaceKey = "workspace";
const changeAttempts = 20;
const retryPause = () => new Promise((resolve) => setTimeout(resolve, 20 + Math.random() * 80));

const compareAndSet = `local current = redis.call("GET", KEYS[1]) or ""
if current ~= ARGV[1] then return 0 end
if ARGV[2] ~= current then redis.call("SET", KEYS[1], ARGV[2]) end
for index = 2, #KEYS do redis.call("DEL", KEYS[index]) end
return 1`;

export const workspaceOperationSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("createApp"), app: websiteSchema }),
  z.object({ operation: z.literal("deleteApp"), appId: appIdSchema }),
  z.object({ operation: z.literal("addTasks"), appId: appIdSchema, capabilities: z.array(capabilitySchema).min(1).max(200) }),
  z.object({ operation: z.literal("replaceTask"), appId: appIdSchema, taskId: z.string().min(1).max(80), capability: capabilitySchema }),
  z.object({ operation: z.literal("deleteTask"), appId: appIdSchema, taskId: z.string().min(1).max(80) }),
]);

export const discoveryKey = (appId: string) => `discovery:${appId}`;

export type WorkspaceOperation = z.infer<typeof workspaceOperationSchema>;

export class StorageUnavailable extends Error {}
export class AppNotFound extends Error {}
export class WorkspaceLimit extends Error {}

export function storage(config?: { automaticDeserialization?: boolean }) {
  const configured = (process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL) && (process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN);
  if (!configured) throw new StorageUnavailable("Storage is not set up. Add KV_REST_API_URL and KV_REST_API_TOKEN to the server environment.");
  return Redis.fromEnv(config);
}

async function stored<T>(command: (redis: Redis) => Promise<T>) {
  const redis = storage({ automaticDeserialization: false });
  try {
    return await command(redis);
  } catch (error) {
    throw new StorageUnavailable("Storage could not be reached. Try again in a moment.", { cause: error });
  }
}

function parseApps(raw: string | null): Website[] | null {
  if (raw === null) return null;
  let apps: unknown;
  try {
    apps = JSON.parse(raw);
  } catch {
    apps = undefined;
  }
  if (!Array.isArray(apps)) throw new StorageUnavailable("The stored workspace is not a list of apps.");
  return apps;
}

const isWellFormed = (app: unknown) => storedWebsiteSchema.safeParse(app).success;

function wellFormed(apps: Website[]) {
  const kept = apps.filter(isWellFormed);
  if (kept.length < apps.length) Sentry.logger.warn("Skipped malformed stored apps", { count: apps.length - kept.length });
  return kept;
}

function checkLimits(before: Website[], after: Website[]) {
  if (after.length > maxApps && after.length > before.length) throw new WorkspaceLimit(`MCParrot holds at most ${maxApps} apps. Delete an app first.`);
  const taskCounts = new Map(before.map((app) => [app.id, app.tasks?.length ?? 0]));
  const full = after.find((app) => app.tasks?.length > maxTasksPerApp && app.tasks.length > (taskCounts.get(app.id) ?? 0));
  if (full) throw new WorkspaceLimit(`${full.name} holds at most ${maxTasksPerApp} tasks. Delete a task first.`);
}

const readStoredWorkspace = () => stored((redis) => redis.get<string>(workspaceKey));

export async function readWorkspace() {
  const apps = parseApps(await readStoredWorkspace());
  return apps && wellFormed(apps);
}

async function changeStoredApps(change: (apps: Website[]) => Website[], deleteKeys: string[], keepMalformed: (app: unknown) => boolean) {
  for (let attempt = 0; attempt < changeAttempts; attempt++) {
    if (attempt) await retryPause();
    const raw = await readStoredWorkspace();
    const current = parseApps(raw) ?? [];
    const valid = wellFormed(current);
    const apps = change(valid);
    checkLimits(valid, apps);
    const unchanged = raw === null && !apps.length;
    const next = unchanged ? "" : JSON.stringify([...apps, ...current.filter((app) => !isWellFormed(app) && keepMalformed(app))]);
    if (await stored((redis) => redis.eval(compareAndSet, [workspaceKey, ...deleteKeys], [raw ?? "", next])) === 1) return wellFormed(apps);
  }
  throw new StorageUnavailable("Storage is busy with other changes. Try again in a moment.");
}

export const changeApps = (change: (apps: Website[]) => Website[], deleteKeys: string[] = []) => changeStoredApps(change, deleteKeys, () => true);

export const deleteStoredApp = (appId: string, deleteKeys: string[]) =>
  changeStoredApps((apps) => apps.filter((app) => app.id !== appId), deleteKeys, (app) => (app as { id?: unknown } | null)?.id !== appId);

export const changeApp = (appId: string, change: (app: Website) => Website) =>
  changeApps((apps) => {
    if (!apps.some((app) => app.id === appId)) throw new AppNotFound("This app no longer exists. It may have been deleted.");
    return apps.map((app) => app.id === appId ? change(app) : app);
  });

export const updateStoredApp = (appId: string, changes: Partial<Website>) => changeApp(appId, (app) => ({ ...app, ...changes }));
