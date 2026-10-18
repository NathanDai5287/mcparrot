import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Website } from "./capabilities";
import { isOwner } from "./account";

const sha256 = (secret: string) => createHash("sha256").update(secret).digest();

const matchesHash = (secret: string, hash: Buffer) => timingSafeEqual(sha256(secret), hash);

export function newConnectionToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: sha256(token).toString("hex") };
}

function matchesLegacyBypass(bypass: string | null) {
  const legacySecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  return !!bypass && !!legacySecret && matchesHash(bypass, sha256(legacySecret));
}

export async function connectionAllowed(request: Request, app: Website, ownerId: string) {
  const query = new URL(request.url).searchParams;
  const token = query.get("token");
  if (token && app.connectionTokenHash) return matchesHash(token, Buffer.from(app.connectionTokenHash, "hex"));
  return matchesLegacyBypass(query.get("x-vercel-protection-bypass")) && await isOwner(ownerId);
}
