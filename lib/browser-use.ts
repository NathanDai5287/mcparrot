import { BrowserUse } from "browser-use-sdk/v4";
import { chromium, type Page } from "playwright-core";

export const browserUse = () => new BrowserUse();

export async function withPage<T>(cdpUrl: string, work: (page: Page) => Promise<T>) {
  const browser = await chromium.connectOverCDP(cdpUrl);
  try {
    const context = browser.contexts()[0];
    return await work(context.pages()[0] ?? await context.newPage());
  } finally {
    await browser.close();
  }
}
