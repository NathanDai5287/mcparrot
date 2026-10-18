import * as Sentry from "@sentry/nextjs";
import { BrowserUse } from "browser-use-sdk/v4";
import { chromium, type Page } from "playwright-core";

export const browserUse = () => new BrowserUse();

export const startBrowser = (profileId: string, timeoutMinutes: number) =>
  Sentry.startSpan({ name: "browser_use.start", attributes: { "browser_use.timeout_minutes": timeoutMinutes } }, () =>
    browserUse().browsers.create({ profileId, timeout: timeoutMinutes }));

export const stopBrowser = (browserId: string) =>
  Sentry.startSpan({ name: "browser_use.stop" }, () => browserUse().browsers.stop(browserId));

export async function withPage<T>(cdpUrl: string, work: (page: Page) => Promise<T>) {
  const browser = await Sentry.startSpan({ name: "browser_use.cdp_connect" }, () => chromium.connectOverCDP(cdpUrl));
  try {
    const context = browser.contexts()[0];
    return await work(context.pages()[0] ?? await context.newPage());
  } finally {
    await browser.close();
  }
}
