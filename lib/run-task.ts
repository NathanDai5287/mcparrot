import * as Sentry from "@sentry/nextjs";
import type { Page } from "playwright-core";
import { startBrowser, stopBrowser, withPage } from "./browser-use";
import type { Task, Website } from "./capabilities";

const taskBrowserMinutes = 3;
const maximumResponseCharacters = 100_000;
const signInAddress = /log-?in|sign-?in|sso|saml/i;
export const signedOutMessage = "The website is signed out. Open MCParrot, then save a login for this app or select Sign in to website, then try again.";

export type TaskInputs = Record<string, string | undefined>;

export const isReadingTask = (task: Task) => task.requests.every((request) => request.method.toUpperCase() === "GET");

function fillPattern(urlPattern: string, values: Record<string, string>) {
  return urlPattern.replace(/\{([^}]+)\}/g, (placeholder, name: string) => name in values ? encodeURIComponent(values[name]) : placeholder);
}

function looksSignedOut(address: string) {
  const { hostname, pathname } = new URL(address);
  return signInAddress.test(hostname + pathname);
}

function shortened(text: string) {
  return text.length > maximumResponseCharacters ? `${text.slice(0, maximumResponseCharacters)}\n[Response shortened to ${maximumResponseCharacters} characters]` : text;
}

function fetchInPage(page: Page, url: string) {
  return Sentry.startSpan({ name: "task.request", attributes: { "http.request.method": "GET" } }, async (span) => {
    const response = await page.evaluate(async (address) => {
      const reply = await fetch(address, { credentials: "include" });
      return { status: reply.status, url: reply.url, redirected: reply.redirected, contentType: reply.headers.get("content-type") ?? "", body: await reply.text() };
    }, url);
    span.setAttributes({ "http.response.status_code": response.status, "http.response.body.size": response.body.length });
    return response;
  });
}

function readPageText(page: Page, url: string) {
  return Sentry.startSpan({ name: "page.read" }, async (span) => {
    await page.goto(url, { waitUntil: "load" });
    if (looksSignedOut(page.url())) throw new Error(signedOutMessage);
    const text = await page.evaluate(() => document.body.innerText);
    span.setAttribute("page.text.size", text.length);
    return text;
  });
}

async function readRequest(page: Page, url: string) {
  const response = await fetchInPage(page, url);
  if (response.status === 401 || response.status === 403 || (response.redirected && looksSignedOut(response.url))) throw new Error(signedOutMessage);
  const body = response.contentType.includes("html") ? await readPageText(page, url) : response.body;
  return `GET ${url} returned ${response.status}\n${shortened(body)}`;
}

async function readRequests(page: Page, website: string, urls: string[]) {
  await page.goto(website, { waitUntil: "domcontentloaded" });
  if (looksSignedOut(page.url())) throw new Error(signedOutMessage);
  const results = [];
  for (const url of urls) results.push(await readRequest(page, url));
  return results.join("\n\n");
}

async function readUrls(app: Website, urls: string[]) {
  if (!app.browserProfileId) throw new Error(signedOutMessage);
  const browser = await startBrowser(app.browserProfileId, taskBrowserMinutes);
  try {
    return await withPage(browser.cdpUrl!, (page) => readRequests(page, new URL(app.url).origin, urls));
  } finally {
    await stopBrowser(browser.id);
  }
}

async function logOutcome(name: string, attributes: Record<string, string | number>, read: () => Promise<string>) {
  try {
    const result = await read();
    Sentry.logger.info(`${name} finished`, { ...attributes, resultSize: result.length });
    return result;
  } catch (error) {
    const reason = (error as Error).message;
    Sentry.logger.warn(`${name} failed`, { ...attributes, signedOut: reason === signedOutMessage, reason });
    throw error;
  }
}

export function runTask(app: Website, task: Task, inputs: TaskInputs) {
  const values = Object.fromEntries(task.inputs.map((input) => [input.name, inputs[input.name] ?? input.example]));
  const urls = task.requests.map((request) => new URL(fillPattern(request.urlPattern, values), app.url).href);
  return logOutcome("Task", { appId: app.id, task: task.name, requestCount: task.requests.length }, () => readUrls(app, urls));
}

export function readPage(app: Website, url: string) {
  const website = new URL(app.url).origin;
  const address = new URL(url, website);
  if (address.origin !== website) throw new Error(`read_page only opens pages on ${website}. Give an address on that website or a path such as /courses.`);
  return logOutcome("Page read", { appId: app.id }, () => readUrls(app, [address.href]));
}
