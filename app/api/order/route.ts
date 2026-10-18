import * as Sentry from "@sentry/nextjs";
import { z } from "zod";
import { isOwner, signedInUserId } from "../../../lib/account";
import { appIdSchema, type Website } from "../../../lib/capabilities";
import { cancelOrder, checkOrder, OrderRefused, orderIdSchema, orderRequestSchema, placeOrder, prepareOrder, readLinkStatus, storedOrder } from "../../../lib/order";
import { ownedApp } from "../../../lib/workspace";

export const runtime = "nodejs";
export const maxDuration = 300;

const OrderAction = z.discriminatedUnion("action", [
  z.object({ action: z.literal("prepare"), appId: appIdSchema, request: orderRequestSchema }),
  z.object({ action: z.literal("place"), appId: appIdSchema, orderId: orderIdSchema, approvedTotal: z.number().nonnegative() }),
  z.object({ action: z.literal("cancel"), appId: appIdSchema, orderId: orderIdSchema }),
]);

type OrderAction = z.infer<typeof OrderAction>;

const appNotFound = () => Response.json({ error: "This app no longer exists in MCParrot." }, { status: 404 });
const ownerOnly = () => Response.json({ error: "Only the MCParrot owner can use ordering." }, { status: 403 });

function refusalResponse(error: unknown) {
  if (!(error instanceof OrderRefused)) throw error;
  if (error.cause) Sentry.captureException(error);
  return Response.json({ error: error.message }, { status: error.reason === "unavailable" ? 503 : 409 });
}

function invalidActionMessage(error: z.ZodError) {
  const field = error.issues[0]?.path[0];
  if (field === "orderId") return "This order ID is not valid. Check the order again.";
  if (field === "approvedTotal") return "The approved total is missing. Check the order again, then place it.";
  if (field === "request") return "The order request is not valid. Describe the order in 1 to 1,000 characters.";
  return "MCParrot could not read this order request. Reload the page and try again.";
}

export async function GET(request: Request) {
  const userId = await signedInUserId();
  if (!await isOwner(userId)) return ownerOnly();
  const appId = appIdSchema.safeParse(new URL(request.url).searchParams.get("appId"));
  if (!appId.success) return Response.json({ error: "MCParrot could not read this order request. Reload the page and try again." }, { status: 400 });
  const app = await ownedApp(userId, appId.data);
  if (!app) return appNotFound();
  const [link, checked] = await Promise.all([readLinkStatus(), checkOrder(app).then((order) => ({ order, error: undefined }), (error: unknown) => ({ order: undefined, error }))]);
  const linkView = link ? { connected: link.isConnected, mode: link.mode ?? null, hasConnection: !!link.connectionId } : null;
  if (!checked.error) return Response.json({ link: linkView, order: checked.order });
  const failure = refusalResponse(checked.error);
  const order = await storedOrder(app.id).catch(() => undefined);
  return Response.json({ link: linkView, order, error: (checked.error as Error).message }, { status: order === undefined ? failure.status : 200 });
}

function apply(action: OrderAction, app: Website) {
  if (action.action === "prepare") return prepareOrder(app, action.request);
  if (action.action === "place") return placeOrder(app, action.orderId, action.approvedTotal);
  return cancelOrder(app, action.orderId);
}

export async function POST(request: Request) {
  const userId = await signedInUserId();
  if (!await isOwner(userId)) return ownerOnly();
  const action = OrderAction.safeParse(await request.json().catch(() => null));
  if (!action.success) return Response.json({ error: invalidActionMessage(action.error) }, { status: 400 });
  const app = await ownedApp(userId, action.data.appId);
  if (!app) return appNotFound();
  try {
    return Response.json({ order: await apply(action.data, app) });
  } catch (error) {
    return refusalResponse(error);
  }
}
