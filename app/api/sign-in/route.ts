import * as Sentry from "@sentry/nextjs";
import { Redis } from "@upstash/redis";
import { z } from "zod";
import { signedInUserId } from "../../../lib/account";
import { browserUse, ignoreErrors, isGone, startBrowser, stopBrowser, stopWarmBrowser, withPage } from "../../../lib/browser-use";
import { appIdSchema } from "../../../lib/capabilities";
import { pendingSignInKey, stopPendingSignIn } from "../../../lib/login";
import { ensureProfile, signInLockKey, withLock } from "../../../lib/sign-in";
import { ownedApp, StorageUnavailable, updateStoredApp } from "../../../lib/workspace";

export const runtime = "nodejs";
export const maxDuration = 60;

const signInMinutes = 15;
const openPageTimeout = 10_000;
const automaticSignInBusyMessage = "MCParrot is signing in to this website automatically. Wait a minute, then select Sign in to website again.";

const SignInBody = z.object({ appId: appIdSchema });
const StopQuery = z.object({ appId: appIdSchema, browserId: z.string().min(1) });

export async function POST(request: Request) {
  const userId = await signedInUserId();
  if (!process.env.BROWSER_USE_API_KEY) return Response.json({ error: "Sign-in is not set up. Add BROWSER_USE_API_KEY to the server environment." }, { status: 500 });
  const body = SignInBody.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Missing appId." }, { status: 400 });
  const { appId } = body.data;
  const started = await withLock(signInLockKey(appId), automaticSignInBusyMessage, () => openSignInBrowser(userId, appId)).catch((error) => {
    Sentry.captureException(error);
    return Response.json({ error: "Browser Use could not open a sign-in browser. Try again." }, { status: 502 });
  });
  return typeof started === "string" ? Response.json({ error: started }, { status: 409 }) : started;
}

async function openSignInBrowser(userId: string, appId: string) {
  let browser: Awaited<ReturnType<typeof startBrowser>>;
  let profileId: string;
  try {
    const app = await ownedApp(userId, appId);
    if (!app) return Response.json({ error: "App not found." }, { status: 404 });
    Sentry.logger.info("Sign-in started", { app: app.name, newProfile: !app.browserProfileId });
    profileId = await ensureProfile(app);
    await stopPendingSignIn(appId);
    await stopWarmBrowser(appId);
    browser = await startBrowser(profileId, signInMinutes);
    await Redis.fromEnv().set(pendingSignInKey(appId), { browserId: browser.id }, { ex: signInMinutes * 60 }).catch(async (error) => {
      await ignoreErrors(() => stopBrowser(browser.id));
      throw error;
    });
    if (!await ownedApp(userId, appId)) {
      await ignoreErrors(() => stopBrowser(browser.id));
      await Redis.fromEnv().del(pendingSignInKey(appId));
      return Response.json({ error: "App not found." }, { status: 404 });
    }
    try {
      await withPage(browser.cdpUrl!, (page) => page.goto(app.url, { waitUntil: "domcontentloaded", timeout: openPageTimeout }), openPageTimeout);
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
  const userId = await signedInUserId();
  const { searchParams } = new URL(request.url);
  const query = StopQuery.safeParse({ browserId: searchParams.get("browserId"), appId: searchParams.get("appId") });
  const finished = searchParams.get("finished") !== "false";
  if (!query.success) return Response.json({ error: "Missing browserId or appId." }, { status: 400 });
  const { browserId, appId } = query.data;
  let browser;
  let profileId;
  try {
    profileId = (await ownedApp(userId, appId))?.browserProfileId;
    browser = profileId && await browserUse().browsers.get(browserId).catch((error) => {
      if (isGone(error)) return undefined;
      throw error;
    });
  } catch (error) {
    Sentry.captureException(error);
    if (error instanceof StorageUnavailable) return Response.json({ error: error.message }, { status: 503 });
    return Response.json({ error: finished ? "Browser Use could not be reached. Select Done signing in again." : "Browser Use could not be reached. Select Cancel again." }, { status: 502 });
  }
  if (!browser || browser.metadata.profileId !== profileId) return Response.json({ error: "Sign-in browser not found." }, { status: 404 });
  try {
    await stopWarmBrowser(appId);
    await stopBrowser(browserId).catch(async (error) => {
      if (!isGone(error) && (await browserUse().browsers.get(browserId)).status !== "stopped") throw error;
    });
    await ignoreErrors(async () => {
      const pending = await Redis.fromEnv().get<{ browserId?: string }>(pendingSignInKey(appId));
      if (pending?.browserId === browserId) await Redis.fromEnv().del(pendingSignInKey(appId));
    });
    if (finished) await updateStoredApp(appId, { signedInAt: new Date().toISOString() });
  } catch (error) {
    Sentry.captureException(error);
    return Response.json({ error: finished ? "MCParrot could not save the sign-in. Select Done signing in again." : "MCParrot could not stop the sign-in browser. Select Cancel again." }, { status: 502 });
  }
  Sentry.logger.info(finished ? "Sign-in done" : "Sign-in cancelled");
  return Response.json({ stopped: true });
}
