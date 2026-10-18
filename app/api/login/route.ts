import * as Sentry from "@sentry/nextjs";
import { deleteLogin, saveLogin } from "../../../lib/login";
import { updateStoredApp } from "../../../lib/workspace";

export const runtime = "nodejs";

async function loginHosts(websiteUrl: string) {
  const signInPage = await fetch(websiteUrl, { redirect: "follow" });
  return [...new Set([new URL(websiteUrl).hostname, new URL(signInPage.url).hostname])];
}

export async function PUT(request: Request) {
  if (!process.env.MCPARROT_CREDENTIAL_KEY) return Response.json({ error: "Saved logins are not set up. Add MCPARROT_CREDENTIAL_KEY to the server environment." }, { status: 500 });
  const { appId, websiteUrl, username, password } = await request.json() as { appId: string; websiteUrl: string; username: string; password: string };
  const hosts = await loginHosts(websiteUrl);
  await saveLogin(appId, { username, password, hosts });
  await updateStoredApp(appId, { loginSavedAt: new Date().toISOString() });
  Sentry.logger.info("Login saved", { appId, hosts: hosts.join(", ") });
  return Response.json({ saved: true });
}

export async function DELETE(request: Request) {
  const appId = new URL(request.url).searchParams.get("appId")!;
  await deleteLogin(appId);
  await updateStoredApp(appId, { loginSavedAt: undefined });
  Sentry.logger.info("Login deleted", { appId });
  return Response.json({ deleted: true });
}
