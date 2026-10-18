import * as Sentry from "@sentry/nextjs";
import type { Page } from "playwright-core";
import { startBrowser, stopBrowser, withPage } from "./browser-use";
import type { Task, TaskRequest, TokenHeader, Website } from "./capabilities";
import { bodyPlaceholderPattern, isAllowedRequest, isOnWebsite, paymentRefusal, replayedHeaders, stepPlaceholderPattern, urlPlaceholderPattern } from "./task-request";

const taskBrowserMinutes = 3;
const maximumResponseCharacters = 100_000;
const requestTimeout = 30_000;
const networkQuietTimeout = 5_000;
const shortPageWait = 2_000;
const pageLoadTimeout = requestTimeout - networkQuietTimeout - shortPageWait;
const shortPageCharacters = 200;
const botChallenge = /just a moment|cf-chl|challenge-platform|captcha|prove your humanity|kpsdk|kasada|akamai/i;
const csrfRefusal = /forgery|invalid authenticity token|csrf[^<\n]{0,40}(fail|invalid|missing|mismatch|expired)|(invalid|missing|bad)[^<\n]{0,20}csrf/i;
const csrfCookieNames = ["csrf_token", "csrftoken", "xsrf-token", "_csrf", "csrf-token"];
const csrfPageSelectors = ["meta[name=csrf-token]", "meta[name=csrf_token]", "meta[name=_csrf]", "input[name=csrfmiddlewaretoken]", "input[name=authenticity_token]"];
const signInPart = /^(log[-_]?in|sign[-_]?in|sso|saml\d?)(\.\w+)?$/i;
export const signedOutMessage = "The website is signed out. Open MCParrot, then select Sign in to website on this app, or choose how it signs in again automatically, then try again.";

export const blockedMessage = "The website blocked the automated browser with a bot check, so MCParrot could not read this address. Try again later.";
export const csrfRefusedMessage = "The website refused the request because its protection code was missing or wrong. Record this page again with MCParrot Explorer, then select Find what this site can do.";

export type TaskInputs = Record<string, string | undefined>;

type Reason = "signed_out" | "blocked" | "csrf_refused" | "navigation_failed" | "fetch_failed" | "timeout" | "http_error" | "off_site" | "missing_input" | "missing_step_value" | "refused" | "failed";

type FilledRequest = { method: string; url: string; body?: string; contentType?: string; headers?: Record<string, string>; tokenHeaders?: TokenHeader[] };

type RequestFiller = (responses: string[]) => FilledRequest;

class TaskError extends Error {
  constructor(readonly reason: Reason, message: string) {
    super(message);
  }
}

const signedOut = () => new TaskError("signed_out", signedOutMessage);

function refusal(body: string, mitigated: boolean) {
  if (mitigated || botChallenge.test(body)) return new TaskError("blocked", blockedMessage);
  if (csrfRefusal.test(body)) return new TaskError("csrf_refused", csrfRefusedMessage);
  return signedOut();
}

export const isRunnableTask = (task: Task) => task.requests.length > 0 && task.requests.every(isAllowedRequest);

const jsonEscaped = (value: string) => JSON.stringify(value).slice(1, -1);

const valueAt = (value: unknown, key: string) => value !== null && typeof value === "object" && Object.hasOwn(value, key) ? (value as Record<string, unknown>)[key] : undefined;

function parsedResponse(responses: string[], step: number) {
  if (step < 1 || step > responses.length) throw new TaskError("missing_step_value", `Step ${step} has not run yet, so this tool cannot use its response.`);
  try {
    return JSON.parse(responses[step - 1]) as unknown;
  } catch {
    throw new TaskError("missing_step_value", `Step ${step} did not return JSON, so this tool cannot read a value from its response.`);
  }
}

function stepValue(responses: string[], step: number, path: string) {
  const value = path.split(".").reduce(valueAt, parsedResponse(responses, step));
  if (value === undefined || value === null) throw new TaskError("missing_step_value", `The response of step ${step} has no value at ${path}, so this tool could not fill {step${step}.${path}}.`);
  return typeof value === "string" ? value : JSON.stringify(value);
}

function fillPattern(pattern: string, placeholder: RegExp, values: TaskInputs, responses: string[], encode: (value: string) => string) {
  const missing = new Set<string>();
  const filled = pattern.replace(placeholder, (match, name: string) => {
    const step = name.match(stepPlaceholderPattern);
    if (step) return encode(stepValue(responses, Number(step[1]), step[2]));
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

function filledRequest(app: Website, request: TaskRequest, values: TaskInputs, responses: string[]): FilledRequest {
  const url = addressOnWebsite(app, fillPattern(request.urlPattern, urlPlaceholderPattern, values, responses, encodeURIComponent)).href;
  const bodyEncoding = request.contentType?.toLowerCase().includes("x-www-form-urlencoded") ? encodeURIComponent : jsonEscaped;
  const body = request.bodyPattern === undefined ? undefined : fillPattern(request.bodyPattern, bodyPlaceholderPattern, values, responses, bodyEncoding);
  if (!isAllowedRequest({ method: request.method, urlPattern: url, bodyPattern: body })) throw new TaskError("refused", paymentRefusal);
  return { method: request.method.toUpperCase(), url, body, contentType: body === undefined ? undefined : request.contentType ?? "application/json", headers: replayedHeaders(request.headers), tokenHeaders: request.tokenHeaders };
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
  if (!isOnWebsite(page.url(), website)) throw new TaskError("off_site", `This address left the website ${website}, so MCParrot did not read it.`);
}

function fetchInPage(page: Page, request: FilledRequest) {
  return Sentry.startSpan({ name: "task.request", attributes: { "http.request.method": request.method } }, async (span) => {
    const response = await page.evaluate(async ({ request: { method, url: address, body: requestBody, contentType: requestContentType, headers: savedHeaders, tokenHeaders = [] }, csrfCookieNames, csrfPageSelectors, limit, timeout }) => {
      try {
        const pageValue = (selector: string) => document.querySelector(selector)?.getAttribute(selector.startsWith("meta") ? "content" : "value") || undefined;
        const csrfCookie = document.cookie.split("; ").find((cookie) => csrfCookieNames.includes(cookie.split("=")[0].toLowerCase()));
        const csrfToken = method === "GET" ? undefined : csrfPageSelectors.map(pageValue).find(Boolean) ?? (csrfCookie && decodeURIComponent(csrfCookie.slice(csrfCookie.indexOf("=") + 1)));
        const csrfHeaderName = pageValue("meta[name=_csrf_header]")?.toLowerCase();
        const csrfHeaders = csrfToken ? { "x-csrftoken": csrfToken, "x-csrf-token": csrfToken, "x-xsrf-token": csrfToken, ...(csrfHeaderName ? { [csrfHeaderName]: csrfToken } : {}) } : {};
        const tokens = Object.fromEntries(tokenHeaders.flatMap(({ header, fromLocalStorage }) => {
          const value = localStorage.getItem(fromLocalStorage);
          return value ? [[header, value]] : [];
        }));
        const credentials = Object.keys(tokens).length && new URL(address).origin !== location.origin ? "omit" : "include";
        const headers = { ...savedHeaders, ...tokens, ...(requestContentType ? { "content-type": requestContentType } : {}), ...csrfHeaders };
        const reply = await fetch(address, { method, body: requestBody, headers, redirect: method === "GET" ? "follow" : "manual", credentials, signal: AbortSignal.timeout(timeout) });
        if (reply.type === "opaqueredirect") return { failed: "redirected", status: 0, url: address, redirected: false, mitigated: false, contentType: "", body: "" };
        const contentType = reply.headers.get("content-type") ?? "";
        const html = method === "GET" && contentType.includes("html") && reply.status < 400;
        if (html) await reply.body?.cancel();
        const body = html ? "" : (await reply.text()).slice(0, limit + 1);
        return { failed: "", status: reply.status, url: reply.url, redirected: reply.redirected, mitigated: reply.headers.has("cf-mitigated"), contentType, body };
      } catch (error) {
        return { failed: (error as Error).name === "TimeoutError" ? "timeout" : "fetch_failed", status: 0, url: address, redirected: false, mitigated: false, contentType: "", body: "" };
      }
    }, { request, csrfCookieNames, csrfPageSelectors, limit: maximumResponseCharacters, timeout: requestTimeout });
    span.setAttributes({ "http.response.status_code": response.status, "http.response.body.size": response.body.length });
    return response;
  });
}

const visibleText = (page: Page) => page.evaluate((limit) => document.body.innerText.slice(0, limit + 1), maximumResponseCharacters);

async function settledText(page: Page) {
  await page.waitForLoadState("networkidle", { timeout: networkQuietTimeout }).catch(() => undefined);
  const text = await visibleText(page);
  if (text.length >= shortPageCharacters) return text;
  await page.waitForTimeout(shortPageWait);
  return visibleText(page);
}

function readPageText(page: Page, website: string, url: string) {
  return Sentry.startSpan({ name: "page.read" }, async (span) => {
    const navigation = await page.goto(url, { waitUntil: "load", timeout: pageLoadTimeout });
    requireOnWebsite(page, website);
    const status = navigation?.status() ?? 200;
    if (status === 401 || status === 403) throw refusal(await page.content(), "cf-mitigated" in (navigation?.headers() ?? {}));
    const text = await settledText(page);
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
  return new TaskError("fetch_failed", `${method} ${withoutQuery(url)} redirected, so MCParrot did not follow it.`);
}

async function readRequest(page: Page, website: string, request: FilledRequest) {
  const { method, url } = request;
  const response = await fetchInPage(page, request);
  if (response.failed === "redirected") throw await unfollowedRedirect(page, website, method, url);
  if (response.failed === "timeout") throw new TaskError("timeout", `${method} ${withoutQuery(url)} took longer than ${requestTimeout / 1000} seconds.`);
  if (response.redirected && looksSignedOut(response.url)) throw signedOut();
  if (response.status === 401 || response.status === 403) throw refusal(response.body, response.mitigated);
  if (response.redirected && !isOnWebsite(response.url, website)) throw new TaskError("off_site", `This address redirects off the website ${website}, so MCParrot did not read it.`);
  if (response.status >= 400) throw httpError(method, url, response.status);
  if (response.failed && method !== "GET") throw new TaskError("fetch_failed", `${method} ${withoutQuery(url)} could not be sent.`);
  if (!response.failed && !(method === "GET" && response.contentType.includes("html"))) return { body: response.body, summary: `${method} ${url} returned ${response.status}\n${shortened(response.body)}` };
  const { status, text } = await readPageText(page, website, url);
  if (status >= 400) throw httpError(method, url, status);
  return { body: text, summary: `${method} ${url} returned ${status}\n${shortened(text)}` };
}

async function readRequests(page: Page, website: string, requests: RequestFiller[]) {
  await page.goto(website, { waitUntil: "domcontentloaded", timeout: requestTimeout });
  requireOnWebsite(page, website);
  const responses: string[] = [];
  const results = [];
  for (const fill of requests) {
    const request = fill(responses);
    if (new URL(page.url()).origin !== website) await page.goto(website, { waitUntil: "domcontentloaded", timeout: requestTimeout });
    const { body, summary } = await readRequest(page, website, request);
    responses.push(body);
    results.push(summary);
  }
  return results.join("\n\n");
}

async function runRequests(app: Website, requests: RequestFiller[]) {
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
    return runRequests(app, task.requests.map((request) => (responses) => filledRequest(app, request, values, responses)));
  });
}

export function addressOnWebsite(app: Website, url: string) {
  const website = new URL(app.url).origin;
  const address = new URL(url, website);
  if (!isOnWebsite(address, website)) throw new TaskError("off_site", `MCParrot only uses pages on ${website}. Give an address on that website or a path such as /courses.`);
  return address;
}

export function readPage(app: Website, url: string) {
  const address = addressOnWebsite(app, url);
  return logOutcome("Page read", { appId: app.id }, () => runRequests(app, [() => ({ method: "GET", url: address.href })]));
}
