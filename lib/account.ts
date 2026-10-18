import { auth, clerkClient, type User } from "@clerk/nextjs/server";

export const signedInUserId = async () => (await auth.protect()).userId;

const clerkUser = async (userId: string) => (await clerkClient()).users.getUser(userId);

function hasOwnerEmail(user: User) {
  const ownerEmail = process.env.MCPARROT_OWNER_EMAIL?.trim().toLowerCase();
  const email = user.primaryEmailAddress;
  return !!ownerEmail && email?.verification?.status === "verified" && email.emailAddress.toLowerCase() === ownerEmail;
}

const ownerCacheMilliseconds = 5 * 60_000;
const ownerCache = new Map<string, { owner: boolean; at: number }>();

export async function isOwner(userId: string) {
  const cached = ownerCache.get(userId);
  if (cached && Date.now() - cached.at < ownerCacheMilliseconds) return cached.owner;
  const owner = hasOwnerEmail(await clerkUser(userId));
  ownerCache.set(userId, { owner, at: Date.now() });
  return owner;
}

export async function displayName(userId: string) {
  const user = await clerkUser(userId);
  return user.fullName ?? user.username ?? "MCParrot user";
}
