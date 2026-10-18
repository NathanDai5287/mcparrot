import { randomUUID } from "node:crypto";
import * as Sentry from "@sentry/nextjs";
import { Redis } from "@upstash/redis";
import type { RunCreateBody, RunSummary } from "browser-use-sdk/v4";
import { z } from "zod";
import { browserUse, errorReason, ignoreErrors, sessionBrowser, stopBrowser } from "./browser-use";
import type { Ordering, Website } from "./capabilities";
import { signedOutMessage } from "./run-task";
import { withLock } from "./sign-in";

const browserKeepAliveSeconds = 1800;
const orderRecordSeconds = 3600;
const orderSessionMaxCostUsd = 5;
const totalCheckMilliseconds = 150_000;
const linkStatusUrl = "https://api.browser-use.com/api/v4/stripe-link";

export const orderRequestSchema = z.string().trim().min(1).max(1000);
export const orderIdSchema = z.uuid();

const usd = z.number().nonnegative();
const Cart = z.object({
  items: z.array(z.object({ name: z.string(), quantity: z.number(), price: usd })),
  subtotal: usd,
  fees: usd,
  tip: usd,
  total: usd,
  address: z.string(),
  eta: z.string(),
});
const CheckoutResult = z.object({ outcome: z.enum(["ready", "signed_out", "failed"]), cart: Cart.nullable(), problem: z.string() });
const PaymentResult = z.object({ outcome: z.enum(["placed", "total_changed", "declined", "failed"]), total: usd, confirmation: z.string() });
const LinkStatus = z.object({ isConnected: z.boolean(), connectionId: z.string().nullish(), mode: z.enum(["test", "live"]).nullish() });

export type Cart = z.infer<typeof Cart>;
export type LinkStatus = z.infer<typeof LinkStatus>;
type OrderStatus = "preparing" | "ready" | "placing" | "placed" | "failed" | "cancelled";
type PendingOrder = { orderId: string; sessionId: string; runId: string; status: OrderStatus; cart?: Cart; problem?: string; confirmation?: string };
export type OrderView = Omit<PendingOrder, "sessionId" | "runId">;

export class OrderRefused extends Error {
  constructor(readonly reason: string, message: string) {
    super(message);
  }
}

export const testModeOnlyMessage = "MCParrot places orders only when Browser Use Pay with Link is in test mode. Link is in live mode, so MCParrot did not place this order.";
export const linkUnavailableMessage = "MCParrot could not confirm that Browser Use Pay with Link is connected in test mode, so it did not place this order. Connect Link under Integrations in Browser Use, then try again.";
const orderingOffMessage = "Ordering is off for this app. Turn on Ordering on the app page in MCParrot first.";
const orderBusyMessage = "MCParrot is already working on this order. Wait a minute, then try again.";
const orderInProgressMessage = "An order is already in progress for this app. Check it, or cancel it before you prepare a new one.";
export const noOrderMessage = "No order with this ID is waiting for this app. Prepare a new order.";
const notReadyMessage = "This order is not ready to place. Check the order first.";
const totalUnreadMessage = "Browser Use could not read the checkout total again, so MCParrot did not pay. Try again, or cancel the order.";

const paymentRule = "Pay only with the card that Browser Use Pay with Link issues. Never pay with a card or other payment method saved on the website.";
const noPaymentRule = "Never select a place order, pay, or submit order button in this run, and never enter payment details.";
const cartReport = "On the checkout page, report every item with its quantity and price, the subtotal, all fees and taxes added together as fees, the tip, the total, the delivery address, and the delivery estimate as eta, with every amount in US dollars as a number, and finish with outcome ready.";

const prepareTask = (website: string, request: string) => `Open ${website}. Build a cart for this order: ${request}
Add the items to the cart, then open the checkout page. Keep the delivery address and tip that the website already chose.
${noPaymentRule}
${paymentRule}
If the website shows a sign-in page, finish with outcome signed_out.
${cartReport}
If anything else stops you, finish with outcome failed and describe the problem in one short sentence.`;

const totalCheckTask = (website: string) => `Open the checkout page for the current cart on ${website} if it is not already open. Do not change the cart.
${noPaymentRule}
${paymentRule}
${cartReport}
If the checkout page is not available, finish with outcome failed and describe the problem in one short sentence.`;

const paymentTask = (website: string, total: number) => `On the checkout page for the current cart on ${website}, place the order.
${paymentRule}
Do not change the cart, the address, or the tip.
Before you pay, read the total. If it is not exactly ${dollars(total)}, do not pay, and finish with outcome total_changed and the total you read.
When the website confirms the order, finish with outcome placed, the total paid, and the confirmation number or message.
If the card is declined, finish with outcome declined. If anything else stops you, finish with outcome failed.`;

const cents = (amount: number) => Math.round(amount * 100);
const dollars = (amount: number) => `$${amount.toFixed(2)}`;

export const pendingOrderKey = (appId: string) => `pending-order:${appId}`;
const lockKey = (appId: string) => `order-lock:${appId}`;
const readOrder = (appId: string) => Redis.fromEnv().get<PendingOrder>(pendingOrderKey(appId));
const saveOrder = (appId: string, order: PendingOrder) => Redis.fromEnv().set(pendingOrderKey(appId), order, { ex: orderRecordSeconds });
const isActive = (order: PendingOrder) => ["preparing", "ready", "placing"].includes(order.status);
const isFinished = (run: Pick<RunSummary, "status">) => ["completed", "failed", "cancelled"].includes(run.status);
const view = ({ sessionId: _sessionId, runId: _runId, ...order }: PendingOrder): OrderView => order;

export function requireTestMode(link: LinkStatus | undefined) {
  if (link?.mode === "live") throw new OrderRefused("live_mode", testModeOnlyMessage);
  if (link?.mode !== "test" || !link.isConnected || !link.connectionId) throw new OrderRefused("link_unavailable", linkUnavailableMessage);
  return link.connectionId;
}

export function requireAllowedTotal(limitUsd: number, approvedTotal: number, checkoutTotal: number) {
  if (cents(checkoutTotal) > cents(limitUsd)) throw new OrderRefused("over_limit", `The total ${dollars(checkoutTotal)} is above this app's ${dollars(limitUsd)} spending limit, so MCParrot did not place the order.`);
  if (cents(checkoutTotal) !== cents(approvedTotal)) throw new OrderRefused("total_changed", `The total changed from ${dollars(approvedTotal)} to ${dollars(checkoutTotal)}, so MCParrot did not place the order. Show the new total, and place the order again only after it is approved.`);
}

export async function readLinkStatus() {
  const response = await fetch(linkStatusUrl, { headers: { "X-Browser-Use-API-Key": process.env.BROWSER_USE_API_KEY ?? "" }, redirect: "manual", signal: AbortSignal.timeout(10_000) }).catch(() => undefined);
  if (!response?.ok) {
    Sentry.logger.warn("Link status read failed", { status: response?.status ?? 0 });
    return;
  }
  const status = LinkStatus.safeParse(await response.json().catch(() => null));
  return status.success ? status.data : undefined;
}

function requireOrdering(app: Website): Ordering {
  if (!app.ordering?.enabled) throw new OrderRefused("ordering_off", orderingOffMessage);
  return app.ordering;
}

async function requireOrder(appId: string, orderId: string) {
  const order = await readOrder(appId);
  if (order?.orderId !== orderId) throw new OrderRefused("no_order", noOrderMessage);
  return order;
}

async function withOrderLock<T extends object>(appId: string, work: () => Promise<T>) {
  const result = await withLock(lockKey(appId), orderBusyMessage, work);
  if (typeof result === "string") throw new OrderRefused("busy", result);
  return result;
}

async function stopOrderBrowser(sessionId: string) {
  try {
    const browser = await sessionBrowser(sessionId);
    if (browser) await stopBrowser(browser.id);
  } catch (error) {
    Sentry.logger.warn("Order browser stop failed", { reason: errorReason(error) });
  }
}

export async function stopOrder(order: Pick<PendingOrder, "runId" | "sessionId">) {
  await ignoreErrors(() => browserUse().runs.cancel(order.runId));
  await stopOrderBrowser(order.sessionId);
}

export function prepareOrder(app: Website, request: string) {
  requireOrdering(app);
  const profileId = app.browserProfileId;
  if (!profileId) throw new OrderRefused("signed_out", signedOutMessage);
  return withOrderLock(app.id, () => Sentry.startSpan({ name: "browser_use.agent_order_prepare" }, async () => {
    const current = await readOrder(app.id);
    if (current && isActive(current)) throw new OrderRefused("in_progress", orderInProgressMessage);
    const run = await browserUse().runs.create({
      task: prepareTask(app.url, request),
      browserSettings: { profileId },
      keepAlive: browserKeepAliveSeconds,
      maxCostUsd: orderSessionMaxCostUsd,
      outputSchema: z.toJSONSchema(CheckoutResult),
    });
    const order: PendingOrder = { orderId: randomUUID(), sessionId: run.sessionId, runId: run.id, status: "preparing" };
    await saveOrder(app.id, order);
    Sentry.logger.info("Order preparing", { appId: app.id });
    return view(order);
  }));
}

function afterPrepare(appId: string, order: PendingOrder, run: RunSummary): PendingOrder {
  const result = CheckoutResult.safeParse(run.output);
  const outcome = run.status === "completed" && result.success ? result.data.outcome : "failed";
  const cart = result.data?.cart;
  Sentry.logger.info("Order prepared", { appId, outcome, total: cart?.total ?? 0 });
  if (outcome === "ready" && cart) return { ...order, status: "ready", cart };
  if (outcome === "signed_out") return { ...order, status: "failed", problem: signedOutMessage };
  return { ...order, status: "failed", problem: `Browser Use could not build the cart. ${result.data?.problem ?? ""}`.trim() };
}

function afterPayment(appId: string, order: PendingOrder, run: RunSummary): PendingOrder {
  const result = PaymentResult.safeParse(run.output);
  const outcome = run.status === "completed" && result.success ? result.data.outcome : "failed";
  const approved = order.cart?.total ?? 0;
  const paid = result.data?.total ?? 0;
  Sentry.logger.info("Order payment finished", { appId, outcome, approved, paid });
  if (outcome === "placed") {
    const problem = cents(paid) === cents(approved) ? undefined : `The website reported a total of ${dollars(paid)}, not the approved ${dollars(approved)}.`;
    return { ...order, status: "placed", confirmation: result.data?.confirmation, problem };
  }
  const problems = {
    total_changed: "The total changed before payment, so Browser Use did not pay. Prepare the order again.",
    declined: "The website declined the Link card. In Link test mode this is expected on websites without a Stripe test mode, such as DoorDash.",
    failed: "Browser Use could not place the order. Check the website's order history before you try again, because the order may have gone through.",
  };
  return { ...order, status: "failed", problem: problems[outcome] };
}

async function advanceOrder(app: Website) {
  const order = await readOrder(app.id);
  if (!order || (order.status !== "preparing" && order.status !== "placing")) return order && view(order);
  const run = await browserUse().runs.get(order.runId);
  if (!isFinished(run)) return view(order);
  const next = order.status === "preparing" ? afterPrepare(app.id, order, run) : afterPayment(app.id, order, run);
  if (next.status !== "ready") await stopOrderBrowser(order.sessionId);
  await saveOrder(app.id, next);
  return view(next);
}

export async function checkOrder(app: Website) {
  const advanced = await withLock(lockKey(app.id), orderBusyMessage, () => advanceOrder(app));
  if (typeof advanced !== "string") return advanced;
  const order = await readOrder(app.id);
  return order && view(order);
}

function readCheckout(website: string, sessionId: string) {
  return Sentry.startSpan({ name: "browser_use.agent_order_check_total" }, async () => {
    const run = await browserUse().runs.create({ task: totalCheckTask(website), sessionId, keepAlive: browserKeepAliveSeconds, outputSchema: z.toJSONSchema(CheckoutResult) });
    const finished = await browserUse().runs.waitForCompletion(run.id, { timeout: totalCheckMilliseconds }).catch(async (error) => {
      await ignoreErrors(() => browserUse().runs.cancel(run.id));
      throw error;
    });
    const result = CheckoutResult.safeParse(finished.output);
    if (finished.status !== "completed" || !result.data?.cart) throw new OrderRefused("total_unread", totalUnreadMessage);
    return result.data.cart;
  });
}

async function startPayment(website: string, sessionId: string, total: number) {
  const paymentRun: RunCreateBody & { stripeLinkConnectionId: string } = {
    task: paymentTask(website, total),
    sessionId,
    keepAlive: browserKeepAliveSeconds,
    outputSchema: z.toJSONSchema(PaymentResult),
    stripeLinkConnectionId: requireTestMode(await readLinkStatus()),
  };
  return browserUse().runs.create(paymentRun);
}

async function placeReadyOrder(app: Website, order: PendingOrder & { cart: Cart }, limitUsd: number, span: Sentry.Span) {
  const approved = order.cart.total;
  let latestCart = order.cart;
  try {
    requireTestMode(await readLinkStatus());
    requireAllowedTotal(limitUsd, approved, approved);
    await saveOrder(app.id, { ...order, status: "placing", problem: undefined });
    latestCart = await readCheckout(app.url, order.sessionId);
    requireAllowedTotal(limitUsd, approved, latestCart.total);
    const run = await startPayment(app.url, order.sessionId, latestCart.total);
    const placing: PendingOrder = { ...order, runId: run.id, status: "placing", problem: undefined };
    await saveOrder(app.id, placing);
    span.setAttribute("order.outcome", "payment_started");
    Sentry.logger.info("Order payment started", { appId: app.id, total: approved });
    return view(placing);
  } catch (error) {
    const refusal = error instanceof OrderRefused ? error : new OrderRefused("failed", totalUnreadMessage);
    span.setAttribute("order.outcome", refusal.reason);
    Sentry.logger.warn("Order refused", { appId: app.id, reason: refusal.reason, detail: error instanceof OrderRefused ? "" : errorReason(error) });
    await saveOrder(app.id, { ...order, status: "ready", cart: latestCart, problem: refusal.message });
    throw refusal;
  }
}

export function placeOrder(app: Website, orderId: string) {
  const { limitUsd } = requireOrdering(app);
  return withOrderLock(app.id, () => Sentry.startSpan({ name: "browser_use.agent_order_place" }, async (span) => {
    const order = await requireOrder(app.id, orderId);
    if (order.status !== "ready" || !order.cart) throw new OrderRefused("not_ready", notReadyMessage);
    span.setAttribute("order.total", order.cart.total);
    return placeReadyOrder(app, { ...order, cart: order.cart }, limitUsd, span);
  }));
}

export const cancelOrder = (app: Website, orderId: string) => withOrderLock(app.id, async () => {
  const order = await requireOrder(app.id, orderId);
  if (!isActive(order)) return view(order);
  await stopOrder(order);
  const cancelled: PendingOrder = { ...order, status: "cancelled", problem: undefined };
  await saveOrder(app.id, cancelled);
  Sentry.logger.info("Order cancelled", { appId: app.id, status: order.status });
  return view(cancelled);
});
