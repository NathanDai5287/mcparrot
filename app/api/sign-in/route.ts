import * as Sentry from "@sentry/nextjs";
import { browserUse, startBrowser, stopBrowser, withPage } from "../../../lib/browser-use";
import { changeApp, readWorkspace, updateStoredApp } from "../../../lib/workspace";

export const runtime = "nodejs";
export const maxDuration = 60;

const signInMinutes = 15;

export async function POST(request: Request) {
  if (!process.env.BROWSER_USE_API_KEY) return Response.json({ error: "Sign-in is not set up. Add BROWSER_USE_API_KEY to the server environment." }, { status: 500 });
  const { appId } = await request.json().catch(() => ({})) as { appId?: string };
  if (!appId) return Response.json({ error: "Missing appId." }, { status: 400 });
  let browser: Awaited<ReturnType<typeof startBrowser>>;
  let profileId: string;
  try {
    const app = (await readWorkspace() ?? []).find((storedApp) => storedApp.id === appId);
    if (!app) return Response.json({ error: "App not found." }, { status: 404 });
    Sentry.logger.info("Sign-in started", { app: app.name, newProfile: !app.browserProfileId });
    profileId = app.browserProfileId ?? (await browserUse().profiles.create({ name: `MCParrot ${app.name}` })).id;
    if (!app.browserProfileId) {
      const createdProfileId = profileId;
      const apps = await changeApp(appId, (storedApp) => storedApp.browserProfileId ? storedApp : { ...storedApp, browserProfileId: createdProfileId });
      profileId = apps.find((storedApp) => storedApp.id === appId)?.browserProfileId ?? profileId;
    }
    browser = await startBrowser(profileId, signInMinutes);
    try {
      await withPage(browser.cdpUrl!, (page) => page.goto(app.url, { waitUntil: "domcontentloaded" }));
    } catch (error) {
      Sentry.logger.warn("Sign-in browser could not open the website", { app: app.name });
      Sentry.captureException(error);
    }
  } catch (error) {
    Sentry.captureException(error);
    return Response.json({ error: "Browser Use could not open a sign-in browser. Try again." }, { status: 502 });
  }
  return Response.json({ browserProfileId: profileId, browserId: browser.id, liveUrl: browser.liveUrl });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const browserId = searchParams.get("browserId");
  const appId = searchParams.get("appId");
  const finished = searchParams.get("finished") !== "false";
  if (!browserId || !appId) return Response.json({ error: "Missing browserId or appId." }, { status: 400 });
  try {
    await stopBrowser(browserId).catch(async (error) => {
      if ((await browserUse().browsers.get(browserId)).status !== "stopped") throw error;
    });
    if (finished) await updateStoredApp(appId, { signedInAt: new Date().toISOString() });
  } catch (error) {
    Sentry.captureException(error);
    return Response.json({ error: finished ? "MCParrot could not save the sign-in. Select Done signing in again." : "MCParrot could not stop the sign-in browser. Select Cancel again." }, { status: 502 });
  }
  Sentry.logger.info(finished ? "Sign-in done" : "Sign-in cancelled");
  return Response.json({ stopped: true });
}
