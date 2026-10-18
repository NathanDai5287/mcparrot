import * as Sentry from "@sentry/nextjs";
import { BrowserUseError } from "browser-use-sdk/v4";
import { isOwner, signedInApiUserId } from "../../../lib/account";
import { browserUse, stopBrowser, stopWarmBrowser } from "../../../lib/browser-use";
import type { Website } from "../../../lib/capabilities";
import { removeAppListing } from "../../../lib/marketplace";
import { pendingOrderKey, stopOrder } from "../../../lib/order";
import { addTasks, replaceTask } from "../../../lib/save-task";
import { AppNotFound, changeApp, changeApps, deleteStoredApp, discoveryKey, migrateLegacyWorkspace, ownedApp, readWorkspace, storage, StorageUnavailable, WorkspaceLimit, workspaceOperationSchema, type WorkspaceOperation } from "../../../lib/workspace";

export const runtime = "nodejs";

const maxBodyLength = 1_000_000;

class OwnerOnly extends Error {}
class AccountUnavailable extends Error {}

const signedOut = () => Response.json({ error: "Sign in again to use MCParrot." }, { status: 401 });

function failure(error: unknown) {
  if (error instanceof StorageUnavailable) return Response.json({ error: error.message }, { status: 503 });
  if (error instanceof AppNotFound) return Response.json({ error: error.message }, { status: 404 });
  if (error instanceof WorkspaceLimit) return Response.json({ error: error.message }, { status: 409 });
  if (error instanceof OwnerOnly) return Response.json({ error: error.message }, { status: 403 });
  if (error instanceof AccountUnavailable) return Response.json({ error: error.message }, { status: 503 });
  throw error;
}

async function ownerOrFalse(userId: string) {
  try {
    return await isOwner(userId);
  } catch (error) {
    Sentry.captureException(error);
    return false;
  }
}

export async function GET() {
  const userId = await signedInApiUserId();
  if (!userId) return signedOut();
  try {
    const owner = await ownerOrFalse(userId);
    if (owner) await migrateLegacyWorkspace(userId);
    return Response.json({ apps: await readWorkspace(userId), isOwner: owner });
  } catch (error) {
    return failure(error);
  }
}

const appKeys = (appId: string) => [`login:${appId}`, `login-rejected:${appId}`, `sign-in-failed:${appId}`, `pending-sign-in:${appId}`, discoveryKey(appId), pendingOrderKey(appId)];

async function cleanUp(work: () => Promise<unknown>) {
  try {
    await work();
  } catch (error) {
    if (!(error instanceof BrowserUseError && error.statusCode === 404)) Sentry.captureException(error);
  }
}

async function deleteApp(app: Website) {
  const pendingKey = `pending-sign-in:${app.id}`;
  const [pending, order] = await Promise.all([
    storage().get<{ browserId?: string }>(pendingKey),
    storage().get<{ runId: string; sessionId: string }>(pendingOrderKey(app.id)),
  ]).catch((error) => {
    throw new StorageUnavailable("Storage could not be reached, so the app was kept. Try again in a moment.", { cause: error });
  });
  await removeAppListing(app).catch((error) => {
    throw new StorageUnavailable("Storage could not be reached, so the app was kept. Try again in a moment.", { cause: error });
  });
  const apps = await deleteStoredApp(app.id, appKeys(app.id));
  await stopWarmBrowser(app.id);
  const { browserId } = pending ?? {};
  if (browserId) await cleanUp(() => stopBrowser(browserId));
  if (order) await cleanUp(() => stopOrder(order));
  const profileId = app.browserProfileId;
  if (profileId) await cleanUp(() => browserUse().profiles.delete(profileId));
  return apps;
}

async function apply(userId: string, change: WorkspaceOperation) {
  if (change.operation === "createApp") return changeApps(userId, (apps) => [...apps, change.app], { deleteKeys: appKeys(change.app.id), newAppIds: [change.app.id] });
  const app = await ownedApp(userId, change.appId);
  if (!app) throw new AppNotFound("This app no longer exists. It may have been deleted.");
  if (change.operation === "deleteApp") return deleteApp(app);
  if (change.operation === "addTasks") return addTasks(app.id, change.capabilities);
  if (change.operation === "replaceTask") return replaceTask(app.id, change.taskId, change.capability);
  if (change.operation === "setOrdering") {
    const owner = await isOwner(userId).catch((error) => {
      throw new AccountUnavailable("MCParrot could not check your account. Try again in a moment.", { cause: error });
    });
    if (!owner) throw new OwnerOnly("Only the MCParrot owner can turn on ordering.");
    return changeApp(app.id, (storedApp) => ({ ...storedApp, ordering: change.ordering }));
  }
  if (change.operation === "setAutomaticSignIn") return changeApp(app.id, (storedApp) => ({ ...storedApp, automaticSignIn: change.automaticSignIn }));
  return changeApp(app.id, (storedApp) => ({ ...storedApp, tasks: storedApp.tasks.filter((task) => task.id !== change.taskId) }));
}

export async function PATCH(request: Request) {
  const userId = await signedInApiUserId();
  if (!userId) return signedOut();
  if (Number(request.headers.get("content-length")) > maxBodyLength) return Response.json({ error: "The change is too large." }, { status: 413 });
  const body = await request.text();
  if (body.length > maxBodyLength) return Response.json({ error: "The change is too large." }, { status: 413 });
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return Response.json({ error: "The change is not valid JSON." }, { status: 400 });
  }
  const change = workspaceOperationSchema.safeParse(json);
  if (!change.success) return Response.json({ error: `The change is not valid. ${change.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}` }, { status: 400 });
  try {
    return Response.json({ apps: await apply(userId, change.data) });
  } catch (error) {
    return failure(error);
  }
}
