import type { Website } from "../../../lib/capabilities";
import { readWorkspace, saveWorkspace } from "../../../lib/workspace";

export const runtime = "nodejs";

export async function GET() {
  return Response.json({ apps: await readWorkspace(), connectionSecret: process.env.VERCEL_AUTOMATION_BYPASS_SECRET });
}

export async function PUT(request: Request) {
  await saveWorkspace(await request.json() as Website[]);
  return Response.json({ saved: true });
}
