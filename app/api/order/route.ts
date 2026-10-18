import { z } from "zod";
import { isOwner, signedInUserId } from "../../../lib/account";
import { appIdSchema, type Website } from "../../../lib/capabilities";
import { cancelOrder, checkOrder, OrderRefused, orderIdSchema, orderRequestSchema, placeOrder, prepareOrder, readLinkStatus } from "../../../lib/order";
import { ownedApp } from "../../../lib/workspace";

export const runtime = "nodejs";
export const maxDuration = 300;

const OrderAction = z.discriminatedUnion("action", [
  z.object({ action: z.literal("prepare"), appId: appIdSchema, request: orderRequestSchema }),
  z.object({ action: z.literal("place"), appId: appIdSchema, orderId: orderIdSchema }),
  z.object({ action: z.literal("cancel"), appId: appIdSchema, orderId: orderIdSchema }),
]);

type OrderAction = z.infer<typeof OrderAction>;

const appNotFound = () => Response.json({ error: "This app no longer exists in MCParrot." }, { status: 404 });
const ownerOnly = () => Response.json({ error: "Only the MCParrot owner can use ordering." }, { status: 403 });

export async function GET(request: Request) {
  const userId = await signedInUserId();
  if (!await isOwner(userId)) return ownerOnly();
  const app = await ownedApp(userId, new URL(request.url).searchParams.get("appId") ?? "");
  if (!app) return appNotFound();
  const [link, order] = await Promise.all([readLinkStatus(), checkOrder(app)]);
  return Response.json({ link: link ? { connected: link.isConnected, mode: link.mode ?? null } : null, order });
}

function apply(action: OrderAction, app: Website) {
  if (action.action === "prepare") return prepareOrder(app, action.request);
  if (action.action === "place") return placeOrder(app, action.orderId);
  return cancelOrder(app, action.orderId);
}

export async function POST(request: Request) {
  const userId = await signedInUserId();
  if (!await isOwner(userId)) return ownerOnly();
  const action = OrderAction.safeParse(await request.json().catch(() => null));
  if (!action.success) return Response.json({ error: "The order request is not valid. Describe the order in 1 to 1,000 characters." }, { status: 400 });
  const app = await ownedApp(userId, action.data.appId);
  if (!app) return appNotFound();
  try {
    return Response.json({ order: await apply(action.data, app) });
  } catch (error) {
    if (error instanceof OrderRefused) return Response.json({ error: error.message }, { status: 409 });
    throw error;
  }
}
