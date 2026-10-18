import * as Sentry from "@sentry/nextjs";
import { Redis } from "@upstash/redis";
import { BrowserUse, BrowserUseError } from "browser-use-sdk/v4";
import { after } from "next/server";
import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import type { Browser, Page } from "playwright-core";

const warmBrowserMinutes = 10;
const warmBrowserReuseSeconds = 7 * 60;
const reusedConnectTimeout = 10_000;
const newPageTimeout = 10_000;
const startLockSeconds = 60;
const startWaitMilliseconds = 45_000;
const startPollMilliseconds = 500;

type WarmBrowser = { id: string; cdpUrl: string };

export const browserUse = () => new BrowserUse();

export const errorReason = (error: unknown) => error instanceof BrowserUseError ? `BrowserUseError ${error.statusCode}` : (error as Error)?.name ?? "unknown";
export const ignoreErrors = async (work: () => Promise<unknown>) => { try { await work(); } catch {} };

export const startBrowser = (profileId: string, timeoutMinutes: number) =>
  Sentry.startSpan({ name: "browser_use.start", attributes: { "browser_use.timeout_minutes": timeoutMinutes } }, () =>
    browserUse().browsers.create({ profileId, timeout: timeoutMinutes, metadata: { profileId } }));

export const stopBrowser = (browserId: string) =>
  Sentry.startSpan({ name: "browser_use.stop" }, () => browserUse().browsers.stop(browserId));

export async function sessionBrowser(sessionId: string) {
  const { items } = await browserUse().browsers.list({ agentSessionId: sessionId, filterBy: "active" });
  return items[0];
}

const connectBrowser = (cdpUrl: string, timeout?: number) => Sentry.startSpan({ name: "browser_use.cdp_connect" }, async () => (await import("playwright-core")).chromium.connectOverCDP(cdpUrl, { timeout }));

export async function withPage<T>(cdpUrl: string, work: (page: Page) => Promise<T>) {
  const browser = await connectBrowser(cdpUrl);
  try {
    const context = browser.contexts()[0];
    return await work(context.pages()[0] ?? await context.newPage());
  } finally {
    await browser.close().catch((error: Error) => Sentry.logger.warn("Browser disconnect failed", { reason: error.message.split("\n")[0] }));
  }
}

const warmBrowserKey = (appId: string) => `warm-browser:${appId}`;
const warmBrowserStartKey = (appId: string) => `warm-browser-start:${appId}`;

export type RunSteps = Record<string, number | boolean>;

export async function timed<T>(steps: RunSteps, step: string, work: () => Promise<T>) {
  const started = performance.now();
  try {
    return await work();
  } finally {
    steps[step] = Math.round(performance.now() - started);
  }
}

const connections = new Map<string, Promise<Browser>>();

function forgetConnection(cdpUrl: string, connecting: Promise<Browser>) {
  if (connections.get(cdpUrl) !== connecting) return;
  connections.delete(cdpUrl);
  connecting.then((browser) => browser.close(), () => undefined).catch(() => undefined);
}

function sharedConnection(cdpUrl: string, timeout?: number) {
  const connecting = connectBrowser(cdpUrl, timeout);
  connections.set(cdpUrl, connecting);
  connecting.then((browser) => browser.on("disconnected", () => forgetConnection(cdpUrl, connecting)), () => forgetConnection(cdpUrl, connecting));
  return connecting;
}

function withinTime<T>(work: Promise<T>, milliseconds: number) {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Opening a browser tab timed out")), milliseconds); });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

async function openPage(cdpUrl: string, steps: RunSteps, timeout?: number): Promise<Page> {
  const cached = connections.get(cdpUrl);
  steps.connectionReused = !!cached;
  const connecting = cached ?? sharedConnection(cdpUrl, timeout);
  try {
    const browser = await timed(steps, "cdpConnectMs", () => connecting);
    if (!browser.isConnected()) throw new Error("The browser connection closed");
    return await timed(steps, "newPageMs", () => withinTime(browser.contexts()[0].newPage(), newPageTimeout));
  } catch (error) {
    forgetConnection(cdpUrl, connecting);
    if (cached) return openPage(cdpUrl, steps, timeout);
    throw error;
  }
}

async function reusedPage(appId: string, steps: RunSteps) {
  const warm = await timed(steps, "warmLookupMs", () => Sentry.startSpan({ name: "browser_use.warm_lookup" }, () => Redis.fromEnv().get<WarmBrowser>(warmBrowserKey(appId))));
  if (!warm) return {};
  const page = await openPage(warm.cdpUrl, steps, reusedConnectTimeout).catch((error: Error) => {
    Sentry.logger.warn("Warm browser connect failed", { appId, reason: error.message.split("\n")[0] });
    return undefined;
  });
  return { page, failedCdpUrl: page ? undefined : warm.cdpUrl };
}

async function startedPage(appId: string, profileId: string, steps: RunSteps, failedCdpUrl?: string) {
  const redis = Redis.fromEnv();
  const nonce = randomUUID();
  const waitUntil = Date.now() + startWaitMilliseconds;
  const waitStarted = performance.now();
  while (await redis.set(warmBrowserStartKey(appId), nonce, { nx: true, ex: startLockSeconds }) === null && Date.now() < waitUntil) {
    await sleep(startPollMilliseconds);
    const warm = await redis.get<WarmBrowser>(warmBrowserKey(appId));
    if (warm && warm.cdpUrl !== failedCdpUrl) {
      steps.browserStartWaitMs = Math.round(performance.now() - waitStarted);
      return openPage(warm.cdpUrl, steps);
    }
  }
  try {
    const { id, cdpUrl } = await timed(steps, "browserStartMs", () => startBrowser(profileId, warmBrowserMinutes));
    await redis.set<WarmBrowser>(warmBrowserKey(appId), { id, cdpUrl: cdpUrl! }, { ex: warmBrowserReuseSeconds });
    return await openPage(cdpUrl!, steps);
  } finally {
    await ignoreErrors(async () => {
      if (await redis.get(warmBrowserStartKey(appId)) === nonce) await redis.del(warmBrowserStartKey(appId));
    });
  }
}

function closeAfterResponse(page: Page) {
  const close = () => page.close().catch(() => undefined);
  try {
    after(close);
  } catch {
    void close();
  }
}

export async function withWarmPage<T>(appId: string, profileId: string, steps: RunSteps, work: (page: Page) => Promise<T>) {
  const { page: reused, failedCdpUrl } = await reusedPage(appId, steps);
  steps.browserReused = !!reused;
  Sentry.getActiveSpan()?.setAttribute("browser.reused", !!reused);
  const page = reused ?? await startedPage(appId, profileId, steps, failedCdpUrl);
  try {
    return await work(page);
  } finally {
    closeAfterResponse(page);
  }
}

export async function stopWarmBrowser(appId: string) {
  await ignoreErrors(async () => {
    const warm = await Redis.fromEnv().getdel<WarmBrowser>(warmBrowserKey(appId));
    if (warm) await stopBrowser(warm.id);
  });
}
