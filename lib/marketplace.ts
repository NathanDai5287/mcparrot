import { createHash, randomUUID } from "node:crypto";
import type { Redis } from "@upstash/redis";
import { z } from "zod";
import { appIdSchema, capabilitySchema, websiteSchema, type Website } from "./capabilities";
import { displayName } from "./account";
import { AppNotFound, changeApps, storage, StorageUnavailable, updateStoredApp } from "./workspace";

const marketplaceKey = "marketplace";
const listingKey = (listingId: string) => `listing:${listingId}`;
const summaryKey = (listingId: string) => `listing-summary:${listingId}`;
const lockKey = (appId: string) => `marketplace-lock:${appId}`;
const listingIdFor = (appId: string) => createHash("sha256").update(appId).digest("hex").slice(0, 32);
const maxListings = 200;
const maxListingTasks = 100;
const maxListingCharacters = 200_000;
const lockSeconds = 30;

export const listingDescriptionSchema = z.string().trim().min(1, "Describe the app in a sentence.").max(500);

const listingSchema = z.object({
  id: appIdSchema,
  ownerId: z.string(),
  publisher: z.string().max(200),
  name: websiteSchema.shape.name,
  url: websiteSchema.shape.url,
  description: listingDescriptionSchema,
  tasks: z.array(capabilitySchema).max(maxListingTasks),
  supportsOrdering: z.boolean(),
  publishedAt: z.iso.datetime(),
});

const summarySchema = listingSchema.omit({ ownerId: true, tasks: true }).extend({ taskNames: z.array(z.string()) });

type Listing = z.infer<typeof listingSchema>;

export type ListingSummary = z.infer<typeof summarySchema>;

export class ListingRejected extends Error {}

export class AlreadyInstalled extends ListingRejected {
  constructor(readonly appId: string) {
    super("This app is already in your apps.");
  }
}

export const appFromListing = (apps: Website[], listingId: string) => apps.find((app) => [app.listing?.id, app.installedFrom, listingIdFor(app.id)].includes(listingId));

const sharedTasks = (app: Website) => app.tasks.map(({ name, description, requests, inputs, returns, keepFields }) => ({ name, description, requests, inputs, returns, keepFields }));

const summary = ({ ownerId, tasks, ...shared }: Listing): ListingSummary => ({ ...shared, taskNames: tasks.map((task) => task.name) });

async function stored<T>(command: (redis: Redis) => Promise<T>) {
  const redis = storage();
  try {
    return await command(redis);
  } catch (error) {
    throw new StorageUnavailable("Storage could not be reached. Try again in a moment.", { cause: error });
  }
}

const releaseLock = `if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) end return 0`;

async function withAppLock<T>(appId: string, work: () => Promise<T>) {
  const nonce = randomUUID();
  if (await stored((redis) => redis.set(lockKey(appId), nonce, { nx: true, ex: lockSeconds })) === null) throw new ListingRejected("Another marketplace change for this app is still running. Try again in a moment.");
  try {
    return await work();
  } finally {
    await stored((redis) => redis.eval(releaseLock, [lockKey(appId)], [nonce])).catch(() => undefined);
  }
}

const writeListing = `
local listed = redis.call("SISMEMBER", KEYS[1], ARGV[1]) == 1
if not listed and redis.call("SCARD", KEYS[1]) >= tonumber(ARGV[2]) then return 0 end
redis.call("SET", KEYS[2], ARGV[3])
redis.call("SET", KEYS[3], ARGV[4])
redis.call("SADD", KEYS[1], ARGV[1])
if listed then return 2 end
return 1`;

function rejection(app: Website, { path, message }: z.core.$ZodIssue) {
  const [field, index, ...rest] = path;
  const task = field === "tasks" && typeof index === "number" ? app.tasks[index] : undefined;
  if (task) return `MCParrot cannot publish the tool ${task.name}, because its ${rest.map(String).join(" ") || "definition"} is not valid: ${message}. Delete that tool first.`;
  return `MCParrot cannot publish this app, because its ${path.map(String).join(" ")} is not valid: ${message}.`;
}

export const publishApp = (userId: string, app: Website, description: string) => withAppLock(app.id, async () => {
  if (app.tasks.length > maxListingTasks) throw new ListingRejected(`Only apps with at most ${maxListingTasks} tools can be published. Delete some tools first.`);
  const parsed = listingSchema.safeParse({
    id: listingIdFor(app.id),
    ownerId: userId,
    publisher: (await displayName(userId)).slice(0, 200),
    name: app.name,
    url: app.url,
    description,
    tasks: sharedTasks(app),
    supportsOrdering: !!app.ordering?.enabled,
    publishedAt: new Date().toISOString(),
  });
  if (!parsed.success) throw new ListingRejected(rejection(app, parsed.error.issues[0]));
  const listing = parsed.data;
  const value = JSON.stringify(listing);
  if (value.length > maxListingCharacters) throw new ListingRejected("This app is too large to publish. Delete some tools first.");
  const written = await stored((redis) => redis.eval(writeListing, [marketplaceKey, listingKey(listing.id), summaryKey(listing.id)], [listing.id, String(maxListings), value, JSON.stringify(summary(listing))]));
  if (written === 0) throw new ListingRejected("The marketplace is full. Try again later.");
  try {
    const apps = await updateStoredApp(app.id, { listing: { id: listing.id, publishedAt: listing.publishedAt, description } });
    if (app.listing && app.listing.id !== listing.id) await removeListings(app.listing.id);
    return apps;
  } catch (error) {
    if (written === 1 || error instanceof AppNotFound) await removeListings(listing.id).catch(() => undefined);
    if (error instanceof AppNotFound) throw new ListingRejected("This app no longer exists in MCParrot.");
    throw error;
  }
});

const removeListings = (...listingIds: string[]) => stored((redis) => redis.multi().del(...listingIds.flatMap((id) => [listingKey(id), summaryKey(id)])).srem(marketplaceKey, ...listingIds).exec());

export const removeAppListing = (app: Website) => removeListings(listingIdFor(app.id), ...(app.listing ? [app.listing.id] : []));

export const unpublishApp = (app: Website) => withAppLock(app.id, async () => {
  await removeAppListing(app);
  return updateStoredApp(app.id, { listing: undefined });
});

const parsedSummaries = (values: unknown[]) => values.flatMap((value) => {
  const listing = summarySchema.safeParse(value);
  return listing.success ? [listing.data] : [];
});

const parsedListings = (values: unknown[]) => values.flatMap((value) => {
  const listing = listingSchema.safeParse(value);
  return listing.success ? [summary(listing.data)] : [];
});

export async function readListings() {
  const listingIds = await stored((redis) => redis.smembers(marketplaceKey));
  if (!listingIds.length) return [];
  const summaries = await stored((redis) => redis.mget<unknown[]>(...listingIds.map(summaryKey)));
  const unsummarized = listingIds.filter((_, index) => summaries[index] === null);
  const listings = unsummarized.length ? await stored((redis) => redis.mget<unknown[]>(...unsummarized.map(listingKey))) : [];
  return [...parsedSummaries(summaries), ...parsedListings(listings)].sort((first, second) => second.publishedAt.localeCompare(first.publishedAt));
}

export async function installListing(userId: string, listingId: string) {
  const listing = listingSchema.safeParse(await stored((redis) => redis.get(listingKey(listingId))));
  if (!listing.success) throw new ListingRejected("This app is no longer in the marketplace.");
  const { name, url, tasks } = listing.data;
  const app: Website = { id: crypto.randomUUID(), name, url, tasks: tasks.map((task) => ({ ...task, id: crypto.randomUUID() })), installedFrom: listingId };
  const apps = await changeApps(userId, (current) => {
    const existing = appFromListing(current, listingId);
    if (existing) throw new AlreadyInstalled(existing.id);
    return [...current, app];
  }, { newAppIds: [app.id] });
  return { apps, appId: app.id };
}
