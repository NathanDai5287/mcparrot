import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { Redis } from "@upstash/redis";

export type Login = { username: string; password: string; hosts: string[] };
type SealedLogin = { iv: string; tag: string; data: string };

const loginKey = (appId: string) => `login:${appId}`;
const credentialKey = () => Buffer.from(process.env.MCPARROT_CREDENTIAL_KEY!, "base64");

export function sealLogin(login: Login): SealedLogin {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", credentialKey(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(login)), cipher.final()]);
  return { iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: data.toString("base64") };
}

export function unsealLogin(sealed: SealedLogin): Login {
  const decipher = createDecipheriv("aes-256-gcm", credentialKey(), Buffer.from(sealed.iv, "base64"));
  decipher.setAuthTag(Buffer.from(sealed.tag, "base64"));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(sealed.data, "base64")), decipher.final()]).toString());
}

export const saveLogin = (appId: string, login: Login) => Redis.fromEnv().set(loginKey(appId), sealLogin(login));

export async function readLogin(appId: string) {
  const sealed = await Redis.fromEnv().get<SealedLogin>(loginKey(appId));
  return sealed && unsealLogin(sealed);
}

export const deleteLogin = (appId: string) => Redis.fromEnv().del(loginKey(appId));
