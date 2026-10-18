import { auth, clerkClient, type User } from "@clerk/nextjs/server";

export const signedInUserId = async () => (await auth.protect()).userId;

export const signedInApiUserId = async () => (await auth()).userId;

const clerkUser = async (userId: string) => (await clerkClient()).users.getUser(userId);

function hasOwnerEmail(user: User) {
  const ownerEmail = process.env.MCPARROT_OWNER_EMAIL?.trim().toLowerCase();
  const email = user.primaryEmailAddress;
  return !!ownerEmail && email?.verification?.status === "verified" && email.emailAddress.toLowerCase() === ownerEmail;
}

const ownerChecks = new Map<string, { owner: boolean; expiresAt: number }>();
const ownerCheckMilliseconds = 60_000;
const maxOwnerChecks = 1000;

export async function isOwner(userId: string) {
  const cached = ownerChecks.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.owner;
  const owner = hasOwnerEmail(await clerkUser(userId));
  if (ownerChecks.size >= maxOwnerChecks) ownerChecks.clear();
  ownerChecks.set(userId, { owner, expiresAt: Date.now() + ownerCheckMilliseconds });
  return owner;
}

export async function displayName(userId: string) {
  const user = await clerkUser(userId);
  return user.fullName ?? user.username ?? "MCParrot user";
}
