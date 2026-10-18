import { z } from "zod";
import { signedInUserId } from "../../../lib/account";
import { appIdSchema } from "../../../lib/capabilities";
import { newConnectionToken } from "../../../lib/connection";
import { ownedApp, updateStoredApp } from "../../../lib/workspace";

export const runtime = "nodejs";

const ConnectionBody = z.object({ appId: appIdSchema });

export async function POST(request: Request) {
  const userId = await signedInUserId();
  const body = ConnectionBody.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Choose an app first." }, { status: 400 });
  if (!await ownedApp(userId, body.data.appId)) return Response.json({ error: "This app no longer exists in MCParrot." }, { status: 404 });
  const { token, hash } = newConnectionToken();
  const apps = await updateStoredApp(body.data.appId, { connectionTokenHash: hash });
  return Response.json({ apps, token });
}
