import * as Sentry from "@sentry/nextjs";
import type { Page } from "playwright-core";
import { startBrowser, stopBrowser, withPage } from "./browser-use";
import type { Task, TaskRequest, Website } from "./capabilities";
import { bodyPlaceholderPattern, isAllowedRequest, paymentRefusal, urlPlaceholderPattern } from "./task-request";

const taskBrowserMinutes = 3;
const maximumResponseCharacters = 100_000;
const requestTimeout = 30_000;
const signInPart = /^(log[-_]?in|sign[-_]?in|sso|saml\d?)(\.\w+)?$/i;
export const signedOutMessage = "The website is signed out. Open MCParrot, then select Sign in to website on this app, or choose how it signs in again automatically, then try again.";

export type TaskInputs = Record<string, string | undefined>;

type Reason = "signed_out" | "navigation_failed" | "fetch_failed" | "timeout" | "http_error" | "off_site" | "missing_input" | "refused" | "failed";

type FilledRequest = { method: string; url: string; body?: string; contentType?: string };

class TaskError extends Error {
  constructor(readonly reason: Reason, message: string) {
    super(message);
  }
}

const signedOut = () => new TaskError("signed_out", signedOutMessage);

export const isRunnableTask = (task: Task) => task.requests.length > 0 && task.requests.every(isAllowedRequest);

const jsonEscaped = (value: string) => JSON.stringify(value).slice(1, -1);

function fillPattern(pattern: string, placeholder: RegExp, values: TaskInputs, encode: (value: string) => string) {
  const missing = new Set<string>();
  const filled = pattern.replace(placeholder, (match, name: string) => {
    const value = Object.hasOwn(values, name) ? values[name] : undefined;
    if (value === undefined) {
      missing.add(name);
      return match;
    }
    return encode(value);
  });
  if (missing.size) throw new TaskError("missing_input", `This tool needs a value for ${[...missing].join(", ")}.`);
  return filled;
}

function filledRequest(app: Website, request: TaskRequest, values: TaskInputs): FilledRequest {
  const url = addressOnWebsite(app, fillPattern(request.urlPattern, urlPlaceholderPattern, values, encodeURIComponent)).href;
  const bodyEncoding = request.contentType?.toLowerCase().includes("x-www-form-urlencoded") ? encodeURIComponent : jsonEscaped;
  const body = request.bodyPattern === undefined ? undefined : fillPattern(request.bodyPattern, bodyPlaceholderPattern, values, bodyEncoding);
  if (!isAllowedRequest({ method: request.method, urlPattern: url, bodyPattern: body })) throw new TaskError("refused", paymentRefusal);
  return { method: request.method.toUpperCase(), url, body, contentType: body === undefined ? undefined : request.contentType ?? "application/json" };
}

function looksSignedOut(address: string) {
  const { hostname, pathname } = new URL(address);
  return [...hostname.split("."), ...pathname.split("/")].some((part) => signInPart.test(part));
}

const withoutQuery = (address: string) => {
  try {
    const url = new URL(address);
    return url.origin + url.pathname;
  } catch {
    return "[address]";
  }
};

const sanitized = (message: string) => (message.split("\n")[0] ?? "").replace(/\bhttps?:\/\/[^\s"'<>]+/g, withoutQuery);

function shortened(text: string) {
  return text.length > maximumResponseCharacters ? `${text.slice(0, maximumResponseCharacters)}\n[Response shortened to ${maximumResponseCharacters} characters]` : text;
}

function requireOnWebsite(page: Page, website: string) {
  if (looksSignedOut(page.url())) throw signedOut();
  if (new URL(page.url()).origin !== website) throw new TaskError("off_site", `This address left the website ${website}, so MCParrot did not read it.`);
}

function fetchInPage(page: Page, request: FilledRequest) {
  return Sentry.startSpan({ name: "task.request", attributes: { "http.request.method": request.method } }, async (span) => {
    const response = await page.evaluate(async ({ request: { method, url: address, body: requestBody, contentType: requestContentType }, limit, timeout }) => {
      try {
        const reply = await fetch(address, { method, body: requestBody, headers: requestContentType ? { "content-type": requestContentType } : undefined, redirect: method === "GET" ? "follow" : "manual", credentials: "include", signal: AbortSignal.timeout(timeout) });
        if (reply.type === "opaqueredirect") return { failed: "redirected", status: 0, url: address, redirected: false, contentType: "", body: "" };
        const contentType = reply.headers.get("content-type") ?? "";
        const html = method === "GET" && contentType.includes("html") && reply.status < 400;
        if (html) await reply.body?.cancel();
        const body = html ? "" : (await reply.text()).slice(0, limit + 1);
        return { failed: "", status: reply.status, url: reply.url, redirected: reply.redirected, contentType, body };
      } catch (error) {
        return { failed: (error as Error).name === "TimeoutError" ? "timeout" : "fetch_failed", status: 0, url: address, redirected: false, contentType: "", body: "" };
      }
    }, { request, limit: maximumResponseCharacters, timeout: requestTimeout });
    span.setAttributes({ "http.response.status_code": response.status, "http.response.body.size": response.body.length });
    return response;
  });
}

function readPageText(page: Page, website: string, url: string) {
  return Sentry.startSpan({ name: "page.read" }, async (span) => {
    const navigation = await page.goto(url, { waitUntil: "load", timeout: requestTimeout });
    requireOnWebsite(page, website);
    const status = navigation?.status() ?? 200;
    if (status === 401 || status === 403) throw signedOut();
    const text = await page.evaluate((limit) => document.body.innerText.slice(0, limit + 1), maximumResponseCharacters);
    span.setAttribute("page.text.size", text.length);
    return { status, text };
  });
}

function httpError(method: string, url: string, status: number) {
  return new TaskError("http_error", `${method} ${withoutQuery(url)} returned ${status}`);
}

async function unfollowedRedirect(page: Page, website: string, method: string, url: string) {
  await page.goto(website, { waitUntil: "domcontentloaded", timeout: requestTimeout });
  if (looksSignedOut(page.url())) return signedOut();
  return new TaskError("off_site", `${method} ${withoutQuery(url)} redirected, so MCParrot did not follow it.`);
}

async function readRequest(page: Page, website: string, request: FilledRequest) {
  const { method, url } = request;
  const response = await fetchInPage(page, request);
  if (response.failed === "redirected") throw await unfollowedRedirect(page, website, method, url);
  if (response.failed === "timeout") throw new TaskError("timeout", `${method} ${withoutQuery(url)} took longer than ${requestTimeout / 1000} seconds.`);
  if (response.status === 401 || response.status === 403 || (response.redirected && looksSignedOut(response.url))) throw signedOut();
  if (response.redirected && new URL(response.url).origin !== website) throw new TaskError("off_site", `This address redirects off the website ${website}, so MCParrot did not read it.`);
  if (response.status >= 400) throw httpError(method, url, response.status);
  if (response.failed && method !== "GET") throw new TaskError("fetch_failed", `${method} ${withoutQuery(url)} could not be sent.`);
  if (!response.failed && !(method === "GET" && response.contentType.includes("html"))) return `${method} ${url} returned ${response.status}\n${shortened(response.body)}`;
  const { status, text } = await readPageText(page, website, url);
  if (status >= 400) throw httpError(method, url, status);
  return `${method} ${url} returned ${status}\n${shortened(text)}`;
}

async function readRequests(page: Page, website: string, requests: FilledRequest[]) {
  await page.goto(website, { waitUntil: "domcontentloaded", timeout: requestTimeout });
  requireOnWebsite(page, website);
  const results = [];
  for (const request of requests) {
    if (new URL(page.url()).origin !== website) await page.goto(website, { waitUntil: "domcontentloaded", timeout: requestTimeout });
    results.push(await readRequest(page, website, request));
  }
  return results.join("\n\n");
}

async function runRequests(app: Website, requests: FilledRequest[]) {
  if (!app.browserProfileId) throw signedOut();
  const browser = await startBrowser(app.browserProfileId, taskBrowserMinutes);
  try {
    return await withPage(browser.cdpUrl!, (page) => readRequests(page, new URL(app.url).origin, requests));
  } finally {
    await stopBrowser(browser.id).catch((error: Error) => Sentry.logger.warn("Browser stop failed", { appId: app.id, reason: sanitized(error.message) }));
  }
}

function failureReason(error: Error): Reason {
  if (error instanceof TaskError) return error.reason;
  if (error.message === signedOutMessage) return "signed_out";
  if (error.name === "TimeoutError" || /timeout/i.test(error.message)) return "timeout";
  if (error.message.startsWith("page.goto")) return "navigation_failed";
  if (/failed to fetch/i.test(error.message)) return "fetch_failed";
  return "failed";
}

async function logOutcome(name: string, attributes: Record<string, string | number>, read: () => Promise<string>) {
  try {
    const result = await read();
    Sentry.logger.info(`${name} finished`, { ...attributes, resultSize: result.length });
    return result;
  } catch (error) {
    const reason = failureReason(error as Error);
    Sentry.logger.warn(`${name} failed`, { ...attributes, signedOut: reason === "signed_out", reason });
    if (error instanceof TaskError) throw error;
    throw new TaskError(reason, sanitized((error as Error).message));
  }
}

export function runTask(app: Website, task: Task, inputs: TaskInputs) {
  return logOutcome("Task", { appId: app.id, task: task.name, requestCount: task.requests.length }, () => {
    const values: TaskInputs = Object.fromEntries(task.inputs.map((input) => [input.name, inputs[input.name] ?? input.example]));
    return runRequests(app, task.requests.map((request) => filledRequest(app, request, values)));
  });
}

export function addressOnWebsite(app: Website, url: string) {
  const website = new URL(app.url).origin;
  const address = new URL(url, website);
  if (address.origin !== website) throw new TaskError("off_site", `MCParrot only uses pages on ${website}. Give an address on that website or a path such as /courses.`);
  return address;
}

export function readPage(app: Website, url: string) {
  const address = addressOnWebsite(app, url);
  return logOutcome("Page read", { appId: app.id }, () => runRequests(app, [{ method: "GET", url: address.href }]));
}
