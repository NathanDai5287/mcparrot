import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import * as Sentry from "@sentry/nextjs";
import { Redis } from "@upstash/redis";
import { stopBrowser } from "./browser-use";

export type Login = { username: string; password: string; hosts: string[] };
type SealedLogin = { v?: 1; kid?: string; iv: string; tag: string; data: string };

export const credentialKeyFormat = "MCPARROT_CREDENTIAL_KEY must be a 32-byte base64 key, for example from `openssl rand -base64 32`.";
export const unreadableLoginMessage = "MCParrot cannot read the saved login for this app. Open MCParrot and replace the login.";
export class CredentialKeyError extends Error {}

const loginKey = (appId: string) => `login:${appId}`;
const pendingSignInKey = (appId: string) => `pending-sign-in:${appId}`;

export function credentialKey() {
  const text = process.env.MCPARROT_CREDENTIAL_KEY?.trim() ?? "";
  const key = Buffer.from(text, "base64");
  if (key.length !== 32 || key.toString("base64") !== text) throw new CredentialKeyError(credentialKeyFormat);
  return key;
}

const keyId = (key: Buffer) => createHash("sha256").update(key).digest().subarray(0, 8).toString("base64");

export function sealLogin(appId: string, login: Login, key = credentialKey()): SealedLogin {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
  cipher.setAAD(Buffer.from(loginKey(appId)));
  const data = Buffer.concat([cipher.update(JSON.stringify(login)), cipher.final()]);
  return { v: 1, kid: keyId(key), iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: data.toString("base64") };
}

export function unsealLogin(appId: string, sealed: SealedLogin, key = credentialKey()): Login {
  if (sealed.v === 1 && sealed.kid !== keyId(key)) throw new Error("The saved login uses a different credential key");
  const iv = Buffer.from(sealed.iv, "base64");
  const tag = Buffer.from(sealed.tag, "base64");
  if (iv.length !== 12 || tag.length !== 16) throw new Error("The saved login has an invalid IV or tag");
  const decipher = createDecipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
  if (sealed.v === 1) decipher.setAAD(Buffer.from(loginKey(appId)));
  decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(sealed.data, "base64")), decipher.final()]).toString());
}

export const saveLogin = (appId: string, login: Login) => Redis.fromEnv().set(loginKey(appId), sealLogin(appId, login));

export async function readLogin(appId: string) {
  const sealed = await Redis.fromEnv().get<SealedLogin>(loginKey(appId));
  if (!sealed) return null;
  let login: Login;
  try {
    login = unsealLogin(appId, sealed);
  } catch {
    Sentry.captureException(new Error("Saved login could not be decrypted"), { tags: { appId } });
    throw new Error(unreadableLoginMessage);
  }
  if (sealed.v !== 1) await saveLogin(appId, login).catch(() => Sentry.logger.warn("Saved login upgrade failed", { appId }));
  return login;
}

export async function deleteLogin(appId: string) {
  const redis = Redis.fromEnv();
  const pending = await redis.get<{ browserId: string }>(pendingSignInKey(appId));
  if (pending) {
    try {
      await stopBrowser(pending.browserId);
    } catch {
      Sentry.logger.warn("Pending sign-in browser stop failed", { appId });
    }
  }
  await redis.del(loginKey(appId), pendingSignInKey(appId));
}
