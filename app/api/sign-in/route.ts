import * as Sentry from "@sentry/nextjs";
import { browserUse, startBrowser, stopBrowser, withPage } from "../../../lib/browser-use";

export const runtime = "nodejs";
export const maxDuration = 60;

const signInMinutes = 15;

export async function POST(request: Request) {
  if (!process.env.BROWSER_USE_API_KEY) return Response.json({ error: "Sign-in is not set up. Add BROWSER_USE_API_KEY to the server environment." }, { status: 500 });
  const { name, websiteUrl, browserProfileId } = await request.json() as { name: string; websiteUrl: string; browserProfileId?: string };
  Sentry.logger.info("Sign-in started", { app: name, newProfile: !browserProfileId });
  const profileId = browserProfileId ?? (await browserUse().profiles.create({ name: `MCParrot ${name}` })).id;
  const browser = await startBrowser(profileId, signInMinutes);
  await withPage(browser.cdpUrl!, (page) => page.goto(websiteUrl, { waitUntil: "domcontentloaded" }));
  return Response.json({ browserProfileId: profileId, browserId: browser.id, liveUrl: browser.liveUrl });
}

export async function DELETE(request: Request) {
  await stopBrowser(new URL(request.url).searchParams.get("browserId")!);
  Sentry.logger.info("Sign-in done");
  return Response.json({ stopped: true });
}
