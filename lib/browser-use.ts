import * as Sentry from "@sentry/nextjs";
import { BrowserUse, BrowserUseError } from "browser-use-sdk/v4";
import { chromium, type Page } from "playwright-core";

export const browserUse = () => new BrowserUse();

export const errorReason = (error: unknown) => error instanceof BrowserUseError ? `BrowserUseError ${error.statusCode}` : (error as Error)?.name ?? "unknown";
export const ignoreErrors = async (work: () => Promise<unknown>) => { try { await work(); } catch {} };

export const startBrowser = (profileId: string, timeoutMinutes: number) =>
  Sentry.startSpan({ name: "browser_use.start", attributes: { "browser_use.timeout_minutes": timeoutMinutes } }, () =>
    browserUse().browsers.create({ profileId, timeout: timeoutMinutes }));

export const stopBrowser = (browserId: string) =>
  Sentry.startSpan({ name: "browser_use.stop" }, () => browserUse().browsers.stop(browserId));

export async function sessionBrowser(sessionId: string) {
  const { items } = await browserUse().browsers.list({ agentSessionId: sessionId, filterBy: "active" });
  return items[0];
}

export async function withPage<T>(cdpUrl: string, work: (page: Page) => Promise<T>) {
  const browser = await Sentry.startSpan({ name: "browser_use.cdp_connect" }, () => chromium.connectOverCDP(cdpUrl));
  try {
    const context = browser.contexts()[0];
    return await work(context.pages()[0] ?? await context.newPage());
  } finally {
    await browser.close().catch((error: Error) => Sentry.logger.warn("Browser disconnect failed", { reason: error.message.split("\n")[0] }));
  }
}
