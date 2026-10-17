import { NextRequest, NextResponse } from "next/server";
import { operateTeaching, readSession, signSession, teachingOperations, type TeachingOperation } from "../../../lib/cloud-teaching";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Use the teaching controls on this site." }, { status: 403 });
  const input = await request.json();
  if (!teachingOperations.includes(input.name) || !/^[a-zA-Z0-9-]{1,80}$/.test(input.appId) || !/^[a-zA-Z0-9-]{1,80}$/.test(input.taskId)) return NextResponse.json({ error: "Choose an app and task." }, { status: 400 });
  const cookieName = `__Host-mcparrot-${input.appId}-${input.taskId}`;
  try {
    const session = readSession(request.cookies.get(cookieName)?.value, input.appId, input.taskId);
    const result = await operateTeaching(input.name as TeachingOperation, session, input.appId, input.taskId, input.arguments);
    const response = NextResponse.json(result.state, { headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
    if (result.session) response.cookies.set(cookieName, signSession(result.session), { httpOnly: true, secure: true, sameSite: "strict", path: "/", expires: new Date(result.session.expiresAt) });
    if (input.name === "end_teaching_session") response.cookies.set(cookieName, "", { httpOnly: true, secure: true, path: "/", maxAge: 0 });
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The hosted teaching action failed." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}
