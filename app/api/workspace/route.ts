import { isOwner, signedInUserId } from "../../../lib/account";
import { stopBrowser } from "../../../lib/browser-use";
import type { Website } from "../../../lib/capabilities";
import { removeAppListing } from "../../../lib/marketplace";
import { pendingOrderKey, stopOrder } from "../../../lib/order";
import { addTasks, replaceTask } from "../../../lib/save-task";
import { AppNotFound, changeApp, changeApps, deleteStoredApp, discoveryKey, migrateLegacyWorkspace, ownedApp, readWorkspace, storage, StorageUnavailable, WorkspaceLimit, workspaceOperationSchema, type WorkspaceOperation } from "../../../lib/workspace";

export const runtime = "nodejs";

const maxBodyLength = 1_000_000;

class OwnerOnly extends Error {}

function failure(error: unknown) {
  if (error instanceof StorageUnavailable) return Response.json({ error: error.message }, { status: 503 });
  if (error instanceof AppNotFound) return Response.json({ error: error.message }, { status: 404 });
  if (error instanceof WorkspaceLimit) return Response.json({ error: error.message }, { status: 409 });
  if (error instanceof OwnerOnly) return Response.json({ error: error.message }, { status: 403 });
  throw error;
}

export async function GET() {
  const userId = await signedInUserId();
  try {
    const owner = await isOwner(userId);
    if (owner) await migrateLegacyWorkspace(userId);
    return Response.json({ apps: await readWorkspace(userId), isOwner: owner });
  } catch (error) {
    return failure(error);
  }
}

const appKeys = (appId: string) => [`login:${appId}`, `pending-sign-in:${appId}`, discoveryKey(appId), pendingOrderKey(appId)];

async function deleteApp(app: Website) {
  const pendingKey = `pending-sign-in:${app.id}`;
  const [pending, order] = await Promise.all([
    storage().get<{ browserId?: string }>(pendingKey),
    storage().get<{ runId: string; sessionId: string }>(pendingOrderKey(app.id)),
  ]).catch((error) => {
    throw new StorageUnavailable("Storage could not be reached, so the app was kept. Try again in a moment.", { cause: error });
  });
  const apps = await deleteStoredApp(app.id, appKeys(app.id));
  await removeAppListing(app);
  if (pending?.browserId) {
    try {
      await stopBrowser(pending.browserId);
    } catch {}
  }
  if (order) await stopOrder(order);
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
    if (!await isOwner(userId)) throw new OwnerOnly("Only the MCParrot owner can turn on ordering.");
    return changeApp(app.id, (storedApp) => ({ ...storedApp, ordering: change.ordering }));
  }
  return changeApp(app.id, (storedApp) => ({ ...storedApp, tasks: storedApp.tasks.filter((task) => task.id !== change.taskId) }));
}

export async function PATCH(request: Request) {
  const userId = await signedInUserId();
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
