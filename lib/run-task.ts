import type { Page } from "playwright-core";
import { browserUse, withPage } from "./browser-use";
import type { Task, Website } from "./capabilities";

const taskBrowserMinutes = 3;
const maximumResponseCharacters = 20_000;
const signInAddress = /log-?in|sign-?in|sso|saml/i;
const signedOutMessage = "The website is signed out. Open MCParrot, select Sign in to website on this app, then try again.";

export const isReadingTask = (task: Task) => task.requests.every((request) => request.method.toUpperCase() === "GET");

function fillPattern(urlPattern: string, values: Record<string, string>) {
  return urlPattern.replace(/\{([^}]+)\}/g, (placeholder, name: string) => name in values ? encodeURIComponent(values[name]) : placeholder);
}

function looksSignedOut(address: string) {
  const { hostname, pathname } = new URL(address);
  return signInAddress.test(hostname + pathname);
}

async function readRequest(page: Page, url: string) {
  const response = await page.evaluate(async (address) => {
    const reply = await fetch(address, { credentials: "include" });
    return { status: reply.status, url: reply.url, redirected: reply.redirected, body: await reply.text() };
  }, url);
  if (response.status === 401 || response.status === 403 || (response.redirected && looksSignedOut(response.url))) throw new Error(signedOutMessage);
  const body = response.body.length > maximumResponseCharacters ? `${response.body.slice(0, maximumResponseCharacters)}\n[Response shortened to ${maximumResponseCharacters} characters]` : response.body;
  return `GET ${url} returned ${response.status}\n${body}`;
}

async function readRequests(page: Page, website: string, urls: string[]) {
  await page.goto(website, { waitUntil: "domcontentloaded" });
  if (looksSignedOut(page.url())) throw new Error(signedOutMessage);
  const results = [];
  for (const url of urls) results.push(await readRequest(page, url));
  return results.join("\n\n");
}

export async function runTask(app: Website, task: Task, inputs: Record<string, string | undefined>) {
  if (!app.browserProfileId) throw new Error(signedOutMessage);
  const values = Object.fromEntries(task.inputs.map((input) => [input.name, inputs[input.name] ?? input.example]));
  const urls = task.requests.map((request) => new URL(fillPattern(request.urlPattern, values), app.url).href);
  const client = browserUse();
  const browser = await client.browsers.create({ profileId: app.browserProfileId, timeout: taskBrowserMinutes });
  try {
    return await withPage(browser.cdpUrl!, (page) => readRequests(page, app.url, urls));
  } finally {
    await client.browsers.stop(browser.id);
  }
}
