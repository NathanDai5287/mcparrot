export type JsonReply = { ok: boolean; body: Record<string, unknown> };

const reuseMilliseconds = 30_000;
const replies = new Map<string, { fetchedAt: number; reply: Promise<JsonReply> }>();

export function cachedJson(url: string): Promise<JsonReply> {
  const cached = replies.get(url);
  if (cached && Date.now() - cached.fetchedAt < reuseMilliseconds) return cached.reply;
  const reply = fetch(url).then(async (response) => ({ ok: response.ok, body: await response.json().catch(() => ({})) }));
  replies.set(url, { fetchedAt: Date.now(), reply });
  reply.then((result) => { if (!result.ok) replies.delete(url); }, () => replies.delete(url));
  return reply;
}

export function forgetCachedJson(url?: string) {
  if (url) replies.delete(url);
  else replies.clear();
}

export function whenIdle(work: () => void) {
  if ("requestIdleCallback" in window) window.requestIdleCallback(work);
  else setTimeout(work, 1);
}

export const discoveryUrl = (appId: string) => `/api/discover?appId=${encodeURIComponent(appId)}`;
export const orderUrl = (appId: string) => `/api/order?appId=${encodeURIComponent(appId)}`;
