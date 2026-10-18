import * as Sentry from "@sentry/nextjs";
import { z } from "zod";
import { CredentialKeyError, credentialKey, deleteLogin, saveLogin } from "../../../lib/login";
import { readWorkspace, updateStoredApp } from "../../../lib/workspace";

export const runtime = "nodejs";

const LoginBody = z.object({ appId: z.string().min(1), username: z.string().min(1), password: z.string().min(1) });

async function loginHosts(appId: string, website: URL) {
  try {
    const signInPage = await fetch(website, { redirect: "follow", signal: AbortSignal.timeout(10_000) });
    return [...new Set([website.hostname, new URL(signInPage.url).hostname])];
  } catch {
    Sentry.logger.warn("Sign-in address lookup failed, so the login is allowed only on the app's host", { appId });
    return [website.hostname];
  }
}

export async function PUT(request: Request) {
  try {
    credentialKey();
  } catch (error) {
    if (!(error instanceof CredentialKeyError)) throw error;
    return Response.json({ error: `Saved logins are not set up. ${error.message}` }, { status: 500 });
  }
  const body = LoginBody.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Enter a username and a password to save the login." }, { status: 400 });
  const { appId, username, password } = body.data;
  const app = (await readWorkspace())?.find((stored) => stored.id === appId);
  if (!app) return Response.json({ error: "This app no longer exists in MCParrot." }, { status: 404 });
  const website = URL.parse(app.url);
  if (website?.protocol !== "https:" && website?.protocol !== "http:") return Response.json({ error: "The app's website address must start with http:// or https://." }, { status: 400 });
  const hosts = await loginHosts(appId, website);
  await saveLogin(appId, { username, password, hosts });
  await updateStoredApp(appId, { loginSavedAt: new Date().toISOString() });
  Sentry.logger.info("Login saved", { appId, hosts: hosts.join(", ") });
  return Response.json({ saved: true });
}

export async function DELETE(request: Request) {
  const appId = new URL(request.url).searchParams.get("appId");
  if (!appId) return Response.json({ error: "Choose an app to delete its login." }, { status: 400 });
  await deleteLogin(appId);
  await updateStoredApp(appId, { loginSavedAt: undefined });
  Sentry.logger.info("Login deleted", { appId });
  return Response.json({ deleted: true });
}
