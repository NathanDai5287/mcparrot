import { z } from "zod";
import { signedInUserId } from "../../../lib/account";
import { appIdSchema } from "../../../lib/capabilities";
import { AlreadyInstalled, installListing, ListingRejected, listingDescriptionSchema, publishApp, readListings, unpublishApp } from "../../../lib/marketplace";
import { AppNotFound, ownedApp, StorageUnavailable, WorkspaceLimit } from "../../../lib/workspace";

export const runtime = "nodejs";
export const maxDuration = 30;

const MarketplaceAction = z.discriminatedUnion("action", [
  z.object({ action: z.literal("publish"), appId: appIdSchema, description: listingDescriptionSchema }),
  z.object({ action: z.literal("unpublish"), appId: appIdSchema }),
  z.object({ action: z.literal("install"), listingId: appIdSchema }),
]);

type MarketplaceAction = z.infer<typeof MarketplaceAction>;

export async function GET() {
  try {
    return Response.json({ listings: await readListings() });
  } catch (error) {
    if (error instanceof StorageUnavailable) return Response.json({ error: error.message }, { status: 503 });
    throw error;
  }
}

const requestProblem = (issues: z.core.$ZodIssue[]) => issues.some((issue) => issue.path[0] === "description") ? "Describe the app in 1 to 500 characters." : "The marketplace request is not valid. Reload the page and try again.";

async function apply(userId: string, action: MarketplaceAction) {
  if (action.action === "install") return installListing(userId, action.listingId);
  const app = await ownedApp(userId, action.appId);
  if (!app) throw new ListingRejected("This app no longer exists in MCParrot.");
  if (action.action === "publish") return { apps: await publishApp(userId, app, action.description) };
  return { apps: await unpublishApp(app) };
}

export async function POST(request: Request) {
  const userId = await signedInUserId();
  const action = MarketplaceAction.safeParse(await request.json().catch(() => null));
  if (!action.success) return Response.json({ error: requestProblem(action.error.issues) }, { status: 400 });
  try {
    return Response.json(await apply(userId, action.data));
  } catch (error) {
    if (error instanceof AlreadyInstalled) return Response.json({ error: error.message, appId: error.appId }, { status: 409 });
    if (error instanceof ListingRejected || error instanceof WorkspaceLimit) return Response.json({ error: error.message }, { status: 409 });
    if (error instanceof AppNotFound) return Response.json({ error: error.message }, { status: 404 });
    if (error instanceof StorageUnavailable) return Response.json({ error: error.message }, { status: 503 });
    throw error;
  }
}
