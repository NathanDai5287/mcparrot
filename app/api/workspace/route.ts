import { stopBrowser } from "../../../lib/browser-use";
import { addTasks } from "../../../lib/save-task";
import { AppNotFound, changeApp, changeApps, readWorkspace, storage, StorageUnavailable, WorkspaceLimit, workspaceOperationSchema, type WorkspaceOperation } from "../../../lib/workspace";

export const runtime = "nodejs";

const maxBodyLength = 1_000_000;

function failure(error: unknown) {
  if (error instanceof StorageUnavailable) return Response.json({ error: error.message }, { status: 503 });
  if (error instanceof AppNotFound) return Response.json({ error: error.message }, { status: 404 });
  if (error instanceof WorkspaceLimit) return Response.json({ error: error.message }, { status: 409 });
  throw error;
}

export async function GET() {
  try {
    return Response.json({ apps: await readWorkspace(), connectionSecret: process.env.VERCEL_AUTOMATION_BYPASS_SECRET });
  } catch (error) {
    return failure(error);
  }
}

async function deleteApp(appId: string) {
  const pendingKey = `pending-sign-in:${appId}`;
  const pending = await storage().get<{ browserId?: string }>(pendingKey).catch((error) => {
    throw new StorageUnavailable("Storage could not be reached, so the app was kept. Try again in a moment.", { cause: error });
  });
  const apps = await changeApps((apps) => apps.filter((app) => app.id !== appId), [`login:${appId}`, pendingKey]);
  if (pending?.browserId) {
    try {
      await stopBrowser(pending.browserId);
    } catch {}
  }
  return apps;
}

function apply(change: WorkspaceOperation) {
  if (change.operation === "createApp") return changeApps((apps) => {
    if (apps.some((app) => app.id === change.app.id)) throw new WorkspaceLimit("An app with this id already exists.");
    return [...apps, change.app];
  });
  if (change.operation === "deleteApp") return deleteApp(change.appId);
  if (change.operation === "addTasks") return addTasks(change.appId, change.capabilities);
  return changeApp(change.appId, (app) => ({ ...app, tasks: app.tasks.filter((task) => task.id !== change.taskId) }));
}

export async function PATCH(request: Request) {
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
    return Response.json({ apps: await apply(change.data) });
  } catch (error) {
    return failure(error);
  }
}
