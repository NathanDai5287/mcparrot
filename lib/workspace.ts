import * as Sentry from "@sentry/nextjs";
import { Redis } from "@upstash/redis";
import { z } from "zod";
import { appIdSchema, automaticSignInSchema, capabilitySchema, maxApps, maxTasksPerApp, orderingSchema, storedWebsiteSchema, websiteSchema, type Website } from "./capabilities";

const legacyWorkspaceKey = "workspace";
const workspaceKey = (userId: string) => `workspace:${userId}`;
const appOwnerKey = (appId: string) => `app-owner:${appId}`;
const changeAttempts = 20;
const retryPause = () => new Promise((resolve) => setTimeout(resolve, 20 + Math.random() * 80));

const compareAndSet = `local current = redis.call("GET", KEYS[1]) or ""
if current ~= ARGV[1] then return 0 end
local lastClaim = 1 + tonumber(ARGV[3])
for index = 2, lastClaim do if redis.call("EXISTS", KEYS[index]) == 1 then return -1 end end
if ARGV[2] ~= current then redis.call("SET", KEYS[1], ARGV[2]) end
for index = 2, lastClaim do redis.call("SET", KEYS[index], ARGV[4]) end
for index = lastClaim + 1, #KEYS do redis.call("DEL", KEYS[index]) end
return 1`;

const moveApps = `if redis.call("GET", KEYS[1]) ~= ARGV[1] then return 0 end
if (redis.call("GET", KEYS[2]) or "") ~= ARGV[2] then return 0 end
redis.call("SET", KEYS[2], ARGV[3])
for index = 3, #KEYS do redis.call("SET", KEYS[index], ARGV[4]) end
redis.call("DEL", KEYS[1])
return 1`;

const ownerAndWorkspace = `local ownerId = redis.call("GET", KEYS[1])
if not ownerId then return false end
return {ownerId, redis.call("GET", ARGV[1] .. ownerId)}`;

export const workspaceOperationSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("createApp"), app: websiteSchema }),
  z.object({ operation: z.literal("deleteApp"), appId: appIdSchema }),
  z.object({ operation: z.literal("addTasks"), appId: appIdSchema, capabilities: z.array(capabilitySchema).min(1).max(200) }),
  z.object({ operation: z.literal("replaceTask"), appId: appIdSchema, taskId: z.string().min(1).max(80), capability: capabilitySchema }),
  z.object({ operation: z.literal("deleteTask"), appId: appIdSchema, taskId: z.string().min(1).max(80) }),
  z.object({ operation: z.literal("setOrdering"), appId: appIdSchema, ordering: orderingSchema }),
  z.object({ operation: z.literal("setAutomaticSignIn"), appId: appIdSchema, automaticSignIn: automaticSignInSchema }),
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
  if (full) throw new WorkspaceLimit(`${full.name} holds at most ${maxTasksPerApp} tools. Delete a tool first.`);
}

const readStoredWorkspace = (key: string) => stored((redis) => redis.get<string>(key));

export async function readWorkspace(userId: string) {
  const apps = parseApps(await readStoredWorkspace(workspaceKey(userId)));
  return apps && wellFormed(apps);
}

export const appOwner = (appId: string) => stored((redis) => redis.get<string>(appOwnerKey(appId)));

export async function findApp(appId: string) {
  const [ownerId, raw] = await stored((redis) => redis.eval<string[], [string, string?] | null>(ownerAndWorkspace, [appOwnerKey(appId)], [workspaceKey("")])) ?? [];
  const apps = parseApps(raw ?? null);
  const app = ownerId && apps ? wellFormed(apps).find((candidate) => candidate.id === appId) : undefined;
  return ownerId && app ? { app, ownerId } : null;
}

export async function ownedApp(userId: string, appId: string) {
  const found = await findApp(appId);
  return found?.ownerId === userId ? found.app : undefined;
}

type KeyChanges = { deleteKeys?: string[]; newAppIds?: string[]; keepMalformed?: (app: unknown) => boolean };

export async function changeApps(userId: string, change: (apps: Website[]) => Website[], { deleteKeys = [], newAppIds = [], keepMalformed = () => true }: KeyChanges = {}) {
  const key = workspaceKey(userId);
  const claimKeys = newAppIds.map(appOwnerKey);
  for (let attempt = 0; attempt < changeAttempts; attempt++) {
    if (attempt) await retryPause();
    const raw = await readStoredWorkspace(key);
    const current = parseApps(raw) ?? [];
    const valid = wellFormed(current);
    const apps = change(valid);
    checkLimits(valid, apps);
    const unchanged = raw === null && !apps.length;
    const next = unchanged ? "" : JSON.stringify([...apps, ...current.filter((app) => !isWellFormed(app) && keepMalformed(app))]);
    const result = await stored((redis) => redis.eval(compareAndSet, [key, ...claimKeys, ...deleteKeys], [raw ?? "", next, String(claimKeys.length), userId]));
    if (result === -1) throw new WorkspaceLimit("An app with this id already exists.");
    if (result === 1) return wellFormed(apps);
  }
  throw new StorageUnavailable("Storage is busy with other changes. Try again in a moment.");
}

async function ownerOf(appId: string) {
  const ownerId = await appOwner(appId);
  if (!ownerId) throw new AppNotFound("This app no longer exists. It may have been deleted.");
  return ownerId;
}

export const deleteStoredApp = async (appId: string, deleteKeys: string[]) =>
  changeApps(await ownerOf(appId), (apps) => apps.filter((app) => app.id !== appId), {
    deleteKeys: [appOwnerKey(appId), ...deleteKeys],
    keepMalformed: (app) => (app as { id?: unknown } | null)?.id !== appId,
  });

export const changeApp = async (appId: string, change: (app: Website) => Website) =>
  changeApps(await ownerOf(appId), (apps) => {
    if (!apps.some((app) => app.id === appId)) throw new AppNotFound("This app no longer exists. It may have been deleted.");
    return apps.map((app) => app.id === appId ? change(app) : app);
  });

export const updateStoredApp = (appId: string, changes: Partial<Website>) => changeApp(appId, (app) => ({ ...app, ...changes }));

export async function moveWorkspace(fromKey: string, userId: string) {
  const toKey = workspaceKey(userId);
  for (let attempt = 0; attempt < changeAttempts; attempt++) {
    if (attempt) await retryPause();
    const [from, to] = await stored((redis) => Promise.all([redis.get<string>(fromKey), redis.get<string>(toKey)]));
    if (from === null) return;
    const movedApps = parseApps(from) ?? [];
    const currentApps = parseApps(to) ?? [];
    const currentIds = new Set(currentApps.map((app) => app?.id));
    const merged = [...currentApps, ...movedApps.filter((app) => !currentIds.has(app?.id))];
    const ownerKeys = movedApps.filter(isWellFormed).map((app) => appOwnerKey(app.id));
    if (await stored((redis) => redis.eval(moveApps, [fromKey, toKey, ...ownerKeys], [from, to ?? "", JSON.stringify(merged), userId])) === 1) {
      Sentry.logger.info("Workspace moved to an account", { appCount: movedApps.length });
      return;
    }
  }
  throw new StorageUnavailable("Storage is busy with other changes. Try again in a moment.");
}

export const migrateLegacyWorkspace = (userId: string) => moveWorkspace(legacyWorkspaceKey, userId);
