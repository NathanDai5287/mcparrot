import { createHash } from "node:crypto";
import { z } from "zod";
import { appIdSchema, capabilitySchema, websiteSchema, type Website } from "./capabilities";
import { displayName } from "./account";
import { AppNotFound, changeApps, storage, updateStoredApp } from "./workspace";

const marketplaceKey = "marketplace";
const listingKey = (listingId: string) => `listing:${listingId}`;
const listingIdFor = (appId: string) => createHash("sha256").update(appId).digest("hex").slice(0, 32);
const maxListings = 200;
const maxListingTasks = 100;
const maxListingCharacters = 200_000;

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

type Listing = z.infer<typeof listingSchema>;

export type ListingSummary = Omit<Listing, "ownerId" | "tasks"> & { taskNames: string[] };

export class ListingRejected extends Error {}

export class AlreadyInstalled extends ListingRejected {
  constructor(readonly appId: string) {
    super("This app is already in your apps.");
  }
}

export const appFromListing = (apps: Website[], listingId: string) => apps.find((app) => [app.listing?.id, app.installedFrom, listingIdFor(app.id)].includes(listingId));

const sharedTasks = (app: Website) => app.tasks.map(({ name, description, requests, inputs, returns, keepFields }) => ({ name, description, requests, inputs, returns, keepFields }));

const summary = ({ ownerId, tasks, ...shared }: Listing): ListingSummary => ({ ...shared, taskNames: tasks.map((task) => task.name) });

export async function publishApp(userId: string, app: Website, description: string) {
  if (app.tasks.length > maxListingTasks) throw new ListingRejected(`Only apps with at most ${maxListingTasks} tools can be published. Delete some tools first.`);
  const listing: Listing = {
    id: listingIdFor(app.id),
    ownerId: userId,
    publisher: await displayName(userId),
    name: app.name,
    url: app.url,
    description,
    tasks: sharedTasks(app),
    supportsOrdering: !!app.ordering?.enabled,
    publishedAt: new Date().toISOString(),
  };
  if (JSON.stringify(listing).length > maxListingCharacters) throw new ListingRejected("This app is too large to publish. Delete some tools first.");
  const redis = storage();
  if (!app.listing && await redis.scard(marketplaceKey) >= maxListings) throw new ListingRejected("The marketplace is full. Try again later.");
  await redis.multi().set(listingKey(listing.id), listing).sadd(marketplaceKey, listing.id).exec();
  try {
    const apps = await updateStoredApp(app.id, { listing: { id: listing.id, publishedAt: listing.publishedAt, description } });
    if (app.listing && app.listing.id !== listing.id) await removeListings(app.listing.id);
    return apps;
  } catch (error) {
    if (!(error instanceof AppNotFound)) throw error;
    await removeListings(listing.id);
    throw new ListingRejected("This app no longer exists in MCParrot.");
  }
}

const removeListings = (...listingIds: string[]) => storage().multi().del(...listingIds.map(listingKey)).srem(marketplaceKey, ...listingIds).exec();

export const removeAppListing = (app: Website) => removeListings(listingIdFor(app.id), ...(app.listing ? [app.listing.id] : []));

export async function unpublishApp(app: Website) {
  await removeAppListing(app);
  return updateStoredApp(app.id, { listing: undefined });
}

export async function readListings() {
  const redis = storage();
  const listingIds = await redis.smembers(marketplaceKey);
  if (!listingIds.length) return [];
  const stored = await redis.mget<unknown[]>(...listingIds.map(listingKey));
  return stored.flatMap((value) => {
    const listing = listingSchema.safeParse(value);
    return listing.success ? [summary(listing.data)] : [];
  }).sort((first, second) => second.publishedAt.localeCompare(first.publishedAt));
}

export async function installListing(userId: string, listingId: string) {
  const listing = listingSchema.safeParse(await storage().get(listingKey(listingId)));
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
