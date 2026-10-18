import { addTasks } from "../../../lib/save-task";
import { changeApp, changeApps, readWorkspace, type WorkspaceOperation } from "../../../lib/workspace";

export const runtime = "nodejs";

export async function GET() {
  return Response.json({ apps: await readWorkspace(), connectionSecret: process.env.VERCEL_AUTOMATION_BYPASS_SECRET });
}

function apply(change: WorkspaceOperation) {
  if (change.operation === "createApp") return changeApps((apps) => [...apps, change.app]);
  if (change.operation === "deleteApp") return changeApps((apps) => apps.filter((app) => app.id !== change.appId));
  if (change.operation === "addTasks") return addTasks(change.appId, change.capabilities);
  return changeApp(change.appId, (app) => ({ ...app, tasks: app.tasks.filter((task) => task.id !== change.taskId) }));
}

export async function PATCH(request: Request) {
  return Response.json({ apps: await apply(await request.json() as WorkspaceOperation) });
}
