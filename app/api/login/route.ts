import { lookup } from "node:dns/promises";
import { BlockList } from "node:net";
import * as Sentry from "@sentry/nextjs";
import { z } from "zod";
import { signedInUserId } from "../../../lib/account";
import { appIdSchema } from "../../../lib/capabilities";
import { CredentialKeyError, credentialKey, deleteLogin, saveLogin } from "../../../lib/login";
import { AppNotFound, ownedApp, updateStoredApp } from "../../../lib/workspace";

export const runtime = "nodejs";

const maxRedirects = 5;

const LoginBody = z.object({ appId: appIdSchema, username: z.string().min(1).max(320), password: z.string().min(1).max(1000) });

const privateAddresses = new BlockList();
for (const [network, prefix] of [["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["224.0.0.0", 3]] as const) privateAddresses.addSubnet(network, prefix, "ipv4");
for (const [network, prefix] of [["::", 127], ["64:ff9b::", 96], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8]] as const) privateAddresses.addSubnet(network, prefix, "ipv6");

async function publicAddress(url: URL) {
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  const addresses = await lookup(url.hostname.replace(/^\[|\]$/g, ""), { all: true });
  return addresses.every(({ address, family }) => !privateAddresses.check(address, family === 6 ? "ipv6" : "ipv4"));
}

async function signInHost(website: URL) {
  const signal = AbortSignal.timeout(10_000);
  let url = website;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    if (!await publicAddress(url)) throw new Error("The sign-in address is not a public address");
    const response = await fetch(url, { redirect: "manual", signal });
    await response.body?.cancel();
    const location = response.headers.get("location");
    if (response.status < 300 || response.status >= 400 || !location) return url.hostname;
    url = new URL(location, url);
  }
  throw new Error("The sign-in address redirects too many times");
}

async function loginHosts(appId: string, website: URL) {
  try {
    return [...new Set([website.hostname, await signInHost(website)])];
  } catch {
    Sentry.logger.warn("Sign-in address lookup failed, so the login is allowed only on the app's host", { appId });
    return [website.hostname];
  }
}

export async function PUT(request: Request) {
  const userId = await signedInUserId();
  try {
    credentialKey();
  } catch (error) {
    if (!(error instanceof CredentialKeyError)) throw error;
    return Response.json({ error: `Saved logins are not set up. ${error.message}` }, { status: 500 });
  }
  const body = LoginBody.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "Enter a username and a password to save the login." }, { status: 400 });
  const { appId, username, password } = body.data;
  const app = await ownedApp(userId, appId);
  if (!app) return Response.json({ error: "This app no longer exists in MCParrot." }, { status: 404 });
  const website = URL.parse(app.url);
  if (website?.protocol !== "https:" && website?.protocol !== "http:") return Response.json({ error: "The app's website address must start with http:// or https://." }, { status: 400 });
  const hosts = await loginHosts(appId, website);
  await saveLogin(appId, { username, password, hosts });
  try {
    await updateStoredApp(appId, { loginSavedAt: new Date().toISOString() });
  } catch (error) {
    if (!(error instanceof AppNotFound)) throw error;
    await deleteLogin(appId);
    return Response.json({ error: "This app no longer exists in MCParrot." }, { status: 404 });
  }
  Sentry.logger.info("Login saved", { appId, hosts: hosts.join(", ") });
  return Response.json({ saved: true });
}

export async function DELETE(request: Request) {
  const userId = await signedInUserId();
  const appId = appIdSchema.safeParse(new URL(request.url).searchParams.get("appId")).data;
  if (!appId) return Response.json({ error: "Choose an app to delete its login." }, { status: 400 });
  if (!await ownedApp(userId, appId)) return Response.json({ error: "This app no longer exists in MCParrot." }, { status: 404 });
  await deleteLogin(appId);
  await updateStoredApp(appId, { loginSavedAt: undefined });
  Sentry.logger.info("Login deleted", { appId });
  return Response.json({ deleted: true });
}
