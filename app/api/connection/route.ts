import { z } from "zod";
import { signedInUserId } from "../../../lib/account";
import { appIdSchema } from "../../../lib/capabilities";
import { newConnectionToken } from "../../../lib/connection";
import { AppNotFound, ownedApp, StorageUnavailable, updateStoredApp } from "../../../lib/workspace";

export const runtime = "nodejs";

const ConnectionBody = z.object({ appId: appIdSchema });

export async function POST(request: Request) {
  const userId = await signedInUserId();
  const body = ConnectionBody.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Choose an app first." }, { status: 400 });
  const gone = () => Response.json({ error: "This app no longer exists in MCParrot." }, { status: 404 });
  try {
    if (!await ownedApp(userId, body.data.appId)) return gone();
    const { token, hash } = newConnectionToken();
    const apps = await updateStoredApp(body.data.appId, { connectionTokenHash: hash });
    return Response.json({ apps, token });
  } catch (error) {
    if (error instanceof StorageUnavailable) return Response.json({ error: error.message }, { status: 503 });
    if (error instanceof AppNotFound) return gone();
    throw error;
  }
}
