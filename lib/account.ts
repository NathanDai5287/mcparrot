import { auth, clerkClient, type User } from "@clerk/nextjs/server";

export const signedInUserId = async () => (await auth.protect()).userId;

export const signedInApiUserId = async () => (await auth()).userId;

const clerkUser = async (userId: string) => (await clerkClient()).users.getUser(userId);

function hasOwnerEmail(user: User) {
  const ownerEmail = process.env.MCPARROT_OWNER_EMAIL?.trim().toLowerCase();
  const email = user.primaryEmailAddress;
  return !!ownerEmail && email?.verification?.status === "verified" && email.emailAddress.toLowerCase() === ownerEmail;
}

export const isOwner = async (userId: string) => hasOwnerEmail(await clerkUser(userId));

export async function displayName(userId: string) {
  const user = await clerkUser(userId);
  return user.fullName ?? user.username ?? "MCParrot user";
}
