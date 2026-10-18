import { z } from "zod";
import { signedInUserId } from "../../../lib/account";
import { appIdSchema } from "../../../lib/capabilities";
import { viewImage } from "../../../lib/view-image";
import { ownedApp } from "../../../lib/workspace";

export const runtime = "nodejs";
export const maxDuration = 300;

const ImageRequest = z.object({ appId: appIdSchema, url: z.string().trim().min(1).max(2000) });

export async function POST(request: Request) {
  const userId = await signedInUserId();
  const body = ImageRequest.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Paste an image address first." }, { status: 400 });
  const app = await ownedApp(userId, body.data.appId);
  if (!app) return Response.json({ error: "This app no longer exists in MCParrot." }, { status: 404 });
  try {
    return Response.json(await viewImage(app, body.data.url));
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 502 });
  }
}
