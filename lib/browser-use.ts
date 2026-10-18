import * as Sentry from "@sentry/nextjs";
import { Redis } from "@upstash/redis";
import { BrowserUse, BrowserUseError } from "browser-use-sdk/v4";
import { chromium, type Page } from "playwright-core";

const warmBrowserMinutes = 10;
const warmBrowserReuseSeconds = 7 * 60;
const reusedConnectTimeout = 10_000;

type WarmBrowser = { id: string; cdpUrl: string };

export const browserUse = () => new BrowserUse();

export const errorReason = (error: unknown) => error instanceof BrowserUseError ? `BrowserUseError ${error.statusCode}` : (error as Error)?.name ?? "unknown";
export const ignoreErrors = async (work: () => Promise<unknown>) => { try { await work(); } catch {} };
export const isGone = (error: unknown) => error instanceof BrowserUseError && error.statusCode === 404;

export const startBrowser = (profileId: string, timeoutMinutes: number) =>
  Sentry.startSpan({ name: "browser_use.start", attributes: { "browser_use.timeout_minutes": timeoutMinutes } }, () =>
    browserUse().browsers.create({ profileId, timeout: timeoutMinutes, metadata: { profileId } }));

export const stopBrowser = (browserId: string) =>
  Sentry.startSpan({ name: "browser_use.stop" }, () => browserUse().browsers.stop(browserId));

export async function sessionBrowser(sessionId: string) {
  const { items } = await browserUse().browsers.list({ agentSessionId: sessionId, filterBy: "active" });
  return items[0];
}

const connectBrowser = (cdpUrl: string, timeout?: number) => Sentry.startSpan({ name: "browser_use.cdp_connect" }, () => chromium.connectOverCDP(cdpUrl, { timeout }));

export async function withPage<T>(cdpUrl: string, work: (page: Page) => Promise<T>, connectTimeout?: number) {
  const browser = await connectBrowser(cdpUrl, connectTimeout);
  try {
    const context = browser.contexts()[0];
    return await work(context.pages()[0] ?? await context.newPage());
  } finally {
    await browser.close().catch((error: Error) => Sentry.logger.warn("Browser disconnect failed", { reason: error.message.split("\n")[0] }));
  }
}

const warmBrowserKey = (appId: string) => `warm-browser:${appId}`;

export type RunSteps = Record<string, number | boolean>;

export async function timed<T>(steps: RunSteps, step: string, work: () => Promise<T>) {
  const started = performance.now();
  try {
    return await work();
  } finally {
    steps[step] = Math.round(performance.now() - started);
  }
}

async function reusedBrowser(appId: string, steps: RunSteps) {
  const warm = await timed(steps, "warmLookupMs", () => Sentry.startSpan({ name: "browser_use.warm_lookup" }, () => Redis.fromEnv().get<WarmBrowser>(warmBrowserKey(appId))));
  if (!warm) return;
  return timed(steps, "cdpConnectMs", () => connectBrowser(warm.cdpUrl, reusedConnectTimeout)).catch((error: Error) => {
    Sentry.logger.warn("Warm browser connect failed", { appId, reason: error.message.split("\n")[0] });
    return undefined;
  });
}

async function startedBrowser(appId: string, profileId: string, steps: RunSteps) {
  const { id, cdpUrl } = await timed(steps, "browserStartMs", () => startBrowser(profileId, warmBrowserMinutes));
  await Redis.fromEnv().set<WarmBrowser>(warmBrowserKey(appId), { id, cdpUrl: cdpUrl! }, { ex: warmBrowserReuseSeconds });
  return timed(steps, "cdpConnectMs", () => connectBrowser(cdpUrl!));
}

export async function withWarmPage<T>(appId: string, profileId: string, steps: RunSteps, work: (page: Page) => Promise<T>) {
  const reused = await reusedBrowser(appId, steps);
  steps.browserReused = !!reused;
  Sentry.getActiveSpan()?.setAttribute("browser.reused", !!reused);
  const browser = reused ?? await startedBrowser(appId, profileId, steps);
  const page = await browser.contexts()[0].newPage();
  try {
    return await work(page);
  } finally {
    await page.close().catch(() => undefined);
    await browser.close().catch((error: Error) => Sentry.logger.warn("Browser disconnect failed", { reason: error.message.split("\n")[0] }));
  }
}

export async function stopWarmBrowser(appId: string) {
  await ignoreErrors(async () => {
    const warm = await Redis.fromEnv().getdel<WarmBrowser>(warmBrowserKey(appId));
    if (warm) await stopBrowser(warm.id);
  });
}
