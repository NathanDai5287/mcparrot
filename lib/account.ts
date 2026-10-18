import { auth, clerkClient, type User } from "@clerk/nextjs/server";

export const signedInUserId = async () => (await auth.protect()).userId;

export const signedInApiUserId = async () => (await auth()).userId;

const clerkUser = async (userId: string) => (await clerkClient()).users.getUser(userId);

function hasOwnerEmail(user: User) {
  const ownerEmail = process.env.MCPARROT_OWNER_EMAIL?.trim().toLowerCase();
  const email = user.primaryEmailAddress;
  return !!ownerEmail && email?.verification?.status === "verified" && email.emailAddress.toLowerCase() === ownerEmail;
}

const ownerChecks = new Map<string, { owner: Promise<boolean>; expiresAt: number }>();
const ownerCheckMilliseconds = 60_000;
const maxOwnerChecks = 1000;

export function isOwner(userId: string) {
  const now = Date.now();
  const cached = ownerChecks.get(userId);
  if (cached && cached.expiresAt > now) return cached.owner;
  if (ownerChecks.size >= maxOwnerChecks) for (const [id, check] of ownerChecks) if (check.expiresAt <= now) ownerChecks.delete(id);
  if (ownerChecks.size >= maxOwnerChecks) ownerChecks.clear();
  const check = { owner: clerkUser(userId).then(hasOwnerEmail), expiresAt: now + ownerCheckMilliseconds };
  ownerChecks.set(userId, check);
  check.owner.catch(() => {
    if (ownerChecks.get(userId) === check) ownerChecks.delete(userId);
  });
  return check.owner;
}

export async function displayName(userId: string) {
  const user = await clerkUser(userId);
  return user.fullName ?? user.username ?? "MCParrot user";
}
