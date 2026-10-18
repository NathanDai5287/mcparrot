"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { maxOrderLimitUsd, type Ordering, type Website } from "../lib/capabilities";
import type { Cart, OrderView } from "../lib/order";
import { SetupCard } from "./setup-card";
import { cachedJson, forgetCachedJson, orderUrl } from "./json-cache";

type LinkView = { connected: boolean; mode: "test" | "live" | null } | null;
type OrderAction = { action: "prepare"; request: string } | { action: "place" | "cancel"; orderId: string };

const pollMilliseconds = 5000;
const dollars = (amount: number) => `$${amount.toFixed(2)}`;

const orderStatusText: Record<OrderView["status"], string> = {
  preparing: "Browser Use is building the cart. This can take a few minutes.",
  ready: "The cart is at checkout, and nothing has been paid. Check the cart and the total, then place or cancel the order.",
  placing: "Browser Use is checking the total and paying with Pay with Link. Approve the payment in the Link app on your phone.",
  placed: "The website confirmed the order.",
  failed: "The order did not finish.",
  cancelled: "The order was cancelled.",
};

function linkStatusText(link: LinkView | undefined) {
  if (link === undefined) return "Checking Browser Use Pay with Link…";
  if (!link) return "MCParrot could not read the Pay with Link status.";
  if (!link.connected) return "Pay with Link is not connected. Connect Link under Integrations in Browser Use.";
  if (link.mode === "test") return "Pay with Link is connected in test mode.";
  return "Pay with Link is in live mode. Live mode is blocked, so MCParrot will not place orders.";
}

function CartSummary({ cart }: { cart: Cart }) {
  return <div className="order-cart">
    {cart.items.map((item, index) => <p key={index}><span>{item.quantity} × {item.name}</span><span>{dollars(item.price)}</span></p>)}
    <p><span>Subtotal</span><span>{dollars(cart.subtotal)}</span></p>
    <p><span>Fees and taxes</span><span>{dollars(cart.fees)}</span></p>
    <p><span>Tip</span><span>{dollars(cart.tip)}</span></p>
    <p className="order-total"><span>Total</span><span>{dollars(cart.total)}</span></p>
    <p><span>Deliver to {cart.address}</span><span>{cart.eta}</span></p>
  </div>;
}

function OrderingSettings({ app, onSave }: { app: Website; onSave: (ordering: Ordering) => Promise<unknown> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    const saved = await onSave({ enabled: fields.get("enabled") === "on", limitUsd: Number(fields.get("limitUsd")) });
    setBusy(false);
    if (!saved) setError("MCParrot could not save the ordering settings. Try again.");
  }

  return <form className="editor" onSubmit={save}>
    <label className="order-switch"><input type="checkbox" role="switch" name="enabled" defaultChecked={app.ordering?.enabled ?? false} />Allow ordering from ChatGPT and from this page</label>
    <label htmlFor={`order-limit-${app.id}`}>Spending limit per order, in US dollars</label>
    <input id={`order-limit-${app.id}`} name="limitUsd" type="number" min="0.01" max={maxOrderLimitUsd} step="0.01" required defaultValue={app.ordering?.limitUsd} />
    {error && <p className="pilot-error" role="alert">{error}</p>}
    <div className="form-actions"><button className="button" type="submit" disabled={busy}>{busy ? "Saving…" : "Save ordering settings"}</button></div>
  </form>;
}

function TestOrder({ app, order, busy, onAction }: { app: Website; order: OrderView | null; busy: boolean; onAction: (action: OrderAction) => void }) {
  function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onAction({ action: "prepare", request: String(new FormData(event.currentTarget).get("request")).trim() });
  }

  const active = order && ["preparing", "ready", "placing"].includes(order.status);
  return <div className="order-test">
    <h3>Test order</h3>
    {order && <>
      <p>{orderStatusText[order.status]}</p>
      {order.problem && <p className="pilot-error">{order.problem}</p>}
      {order.confirmation && <p>Confirmation: {order.confirmation}</p>}
      {order.cart && <CartSummary cart={order.cart} />}
      {active && <div className="form-actions">
        {order.status === "ready" && order.cart && <button className="button primary" disabled={busy} onClick={() => onAction({ action: "place", orderId: order.orderId })}>{busy ? "Working…" : `Place order for ${dollars(order.cart.total)}`}</button>}
        <button className="button" disabled={busy} onClick={() => onAction({ action: "cancel", orderId: order.orderId })}>Cancel order</button>
      </div>}
    </>}
    {!active && <form className="editor" onSubmit={prepare}>
      <label htmlFor={`order-request-${app.id}`}>What to order</label>
      <textarea id={`order-request-${app.id}`} name="request" maxLength={1000} required placeholder="For example, one large pepperoni pizza from a restaurant near me" />
      <div className="form-actions"><button className="button primary" type="submit" disabled={busy}>{busy ? "Starting…" : "Prepare order"}</button></div>
    </form>}
  </div>;
}

export function OrderingPanel({ app, onSave }: { app: Website; onSave: (ordering: Ordering) => Promise<unknown> }) {
  const [link, setLink] = useState<LinkView>();
  const [order, setOrder] = useState<OrderView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const show = useCallback(async () => {
    const reply = await cachedJson(orderUrl(app.id)).catch(() => null);
    if (!reply?.ok) return;
    const result = reply.body as { link: LinkView; order: OrderView | null };
    setLink(result.link);
    setOrder(result.order);
  }, [app.id]);

  const refresh = useCallback(() => {
    forgetCachedJson(orderUrl(app.id));
    return show();
  }, [app.id, show]);

  useEffect(() => { show(); }, [show]);

  const waiting = order?.status === "preparing" || order?.status === "placing";
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(refresh, pollMilliseconds);
    return () => clearInterval(timer);
  }, [waiting, refresh]);

  async function send(action: OrderAction) {
    setBusy(true);
    setError("");
    const response = await fetch("/api/order", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ appId: app.id, ...action }) }).catch(() => null);
    const result = await response?.json().catch(() => ({})) ?? {};
    setBusy(false);
    forgetCachedJson(orderUrl(app.id));
    if (response?.ok) return setOrder(result.order);
    setError(result.error ?? "MCParrot could not reach Browser Use. Try again.");
    await refresh();
  }

  return <SetupCard title="Ordering" status={app.ordering?.enabled ? "On" : "Off"}>
    <p>Let your agent order from {app.name} with Pay with Link. You always approve the total first. Remove saved cards from your {app.name} account before testing.</p>
    <p>{linkStatusText(link)}</p>
    <OrderingSettings app={app} onSave={onSave} />
    {app.ordering?.enabled && <TestOrder app={app} order={order} busy={busy} onAction={send} />}
    {error && <p className="pilot-error" role="alert">{error}</p>}
  </SetupCard>;
}
