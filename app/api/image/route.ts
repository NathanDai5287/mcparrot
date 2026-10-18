import { auth } from "@clerk/nextjs/server";
import * as Sentry from "@sentry/nextjs";
import { z } from "zod";
import { appIdSchema } from "../../../lib/capabilities";
import { ImageError, viewImage } from "../../../lib/view-image";
import { ownedApp } from "../../../lib/workspace";

export const runtime = "nodejs";
export const maxDuration = 300;

const ImageRequest = z.object({ appId: appIdSchema, url: z.string().trim().min(1).max(2000) });

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Sign in again to use MCParrot." }, { status: 401 });
  const body = ImageRequest.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Paste an image address first." }, { status: 400 });
  const app = await ownedApp(userId, body.data.appId);
  if (!app) return Response.json({ error: "This app no longer exists in MCParrot." }, { status: 404 });
  try {
    const view = await viewImage(app, body.data.url);
    if (view.signIn) return Response.json({ error: view.text }, { status: 409 });
    return Response.json(view);
  } catch (error) {
    if (error instanceof ImageError && !error.cause) return Response.json({ error: error.message }, { status: 502 });
    Sentry.captureException(error);
    if (!(error instanceof ImageError)) Sentry.logger.warn("Image read failed", { appId: app.id, reason: "unexpected" });
    return Response.json({ error: "MCParrot could not read the image. Try again." }, { status: 500 });
  }
}
