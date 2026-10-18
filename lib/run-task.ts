import * as Sentry from "@sentry/nextjs";
import { setTimeout as sleep } from "node:timers/promises";
import type { Page } from "playwright-core";
import { timed, withWarmPage, type RunSteps } from "./browser-use";
import { compactAnswer } from "./compact-answer";
import type { Task, TaskRequest, TokenHeader, Website } from "./capabilities";
import { bodyPlaceholderPattern, isAllowedRequest, isOnWebsite, paymentRefusal, replayedHeaders, stepPlaceholderPattern, urlPlaceholderPattern } from "./task-request";

const maximumResponseCharacters = 100_000;
const requestTimeout = 30_000;
const settleTimeout = 5_000;
const settlePoll = 100;
const settledFor = 500;
const shortPageWait = 1_500;
const pageLoadTimeout = requestTimeout - settleTimeout;
const shortPageCharacters = 200;
const blankPagePath = "/__mcparrot";
const maximumPageLinks = 50;
const maximumPageImages = 20;
const linkTextCharacters = 60;
const imageTypes = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const maximumImageSide = 1600;
const maximumImageCharacters = 1_500_000;
const botChallenge = /just a moment|cf-chl|challenge-platform|captcha|prove your humanity|kpsdk|kasada|akamai/i;
const csrfRefusal = /forgery|invalid authenticity token|csrf[^<\n]{0,40}(fail|invalid|missing|mismatch|expired)|(invalid|missing|bad)[^<\n]{0,20}csrf/i;
const csrfPageSelectors = ["meta[name=csrf-token]", "meta[name=csrf_token]", "meta[name=_csrf]", "input[name=csrfmiddlewaretoken]", "input[name=authenticity_token]"];
const signInPart = /^(log[-_]?in|sign[-_]?in|sso|saml\d?)(\.\w+)?$/i;
const doNotRetry = "Do not retry; tell the user: ";
const retryOnce = "Retry once now. ";

export const signedOutMessage = doNotRetry + "The website is signed out. Open MCParrot, then select Sign in to website on this app, or choose how it signs in again automatically, then try again.";

export const blockedMessage = doNotRetry + "The website blocked the automated browser with a bot check, so MCParrot could not read this address. Try again later.";
export const csrfRefusedMessage = doNotRetry + "The website refused the request because its protection code was missing or wrong. Record this page again with MCParrot Explorer, then select Find what this site can do.";

export type TaskInputs = Record<string, string | undefined>;

type Reason = "signed_out" | "blocked" | "csrf_refused" | "navigation_failed" | "fetch_failed" | "timeout" | "http_error" | "off_site" | "missing_input" | "missing_step_value" | "refused" | "not_image" | "image_too_large" | "failed";

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
  if (!isAllowedRequest({ method: request.method, urlPattern: url, bodyPattern: body })) throw new TaskError("refused", doNotRetry + paymentRefusal);
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

function requireOnWebsite(page: Page, website: string) {
  if (looksSignedOut(page.url())) throw signedOut();
  if (!isOnWebsite(page.url(), website)) throw new TaskError("off_site", `${doNotRetry}This address left the website ${website}, so MCParrot did not read it.`);
}

function fetchInPage(page: Page, request: FilledRequest) {
  return Sentry.startSpan({ name: "task.request", attributes: { "http.request.method": request.method } }, async (span) => {
    const response = await page.evaluate(async ({ request: { method, url: address, body: requestBody, contentType: requestContentType, headers: savedHeaders, tokenHeaders = [] }, csrfPageSelectors, limit, timeout }) => {
      try {
        const pageValue = (selector: string) => document.querySelector(selector)?.getAttribute(selector.startsWith("meta") ? "content" : "value") || undefined;
        const cookieValue = (matches: (name: string) => boolean) => document.cookie.split("; ").find((cookie) => matches(cookie.split("=")[0]))?.replace(/^[^=]*=/, "");
        const csrfCookie = cookieValue((name) => /csrf|xsrf/i.test(name));
        const sendsCsrf = method !== "GET" || /\/(api\/)?graphql$/.test(new URL(address).pathname);
        const csrfToken = sendsCsrf ? csrfPageSelectors.map(pageValue).find(Boolean) ?? (csrfCookie && decodeURIComponent(csrfCookie)) : undefined;
        const csrfHeaderName = pageValue("meta[name=_csrf_header]")?.toLowerCase();
        const linkedInToken = cookieValue((name) => name === "JSESSIONID")?.replace(/^"|"$/g, "");
        const csrfHeaders = { ...(csrfToken ? { "x-csrftoken": csrfToken, "x-csrf-token": csrfToken, "x-xsrf-token": csrfToken, ...(csrfHeaderName ? { [csrfHeaderName]: csrfToken } : {}) } : {}), ...(linkedInToken?.startsWith("ajax:") ? { "csrf-token": linkedInToken } : {}) };
        const tokens = Object.fromEntries(tokenHeaders.flatMap(({ header, fromLocalStorage, prefix = "", path }) => {
          const stored = localStorage.getItem(fromLocalStorage);
          const value = stored && path ? path.split(".").reduce<unknown>((data, field) => (data as Record<string, unknown> | undefined)?.[field], JSON.parse(stored)) : stored;
          return typeof value === "string" && value ? [[header, prefix + value]] : [];
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
    }, { request, csrfPageSelectors, limit: maximumResponseCharacters, timeout: requestTimeout });
    span.setAttributes({ "http.response.status_code": response.status, "http.response.body.size": response.body.length });
    return response;
  });
}

const visibleText = (page: Page) => page.evaluate((limit) => document.body.innerText.slice(0, limit + 1), maximumResponseCharacters);

const textLength = (page: Page) => page.evaluate(() => document.body?.innerText.length ?? 0);

async function settledText(page: Page) {
  const started = performance.now();
  let length = await textLength(page);
  let changedAt = started;
  for (;;) {
    const now = performance.now();
    const steady = now - changedAt >= settledFor;
    if (now - started >= settleTimeout || (steady && (length >= shortPageCharacters || now - started >= shortPageWait))) return visibleText(page);
    await sleep(settlePoll);
    const current = await textLength(page);
    if (current !== length) {
      length = current;
      changedAt = performance.now();
    }
  }
}

function readPageText(page: Page, website: string, url: string, steps: RunSteps, step: string) {
  return Sentry.startSpan({ name: "page.read" }, async (span) => {
    const navigation = await page.goto(url, { waitUntil: "load", timeout: pageLoadTimeout });
    requireOnWebsite(page, website);
    const status = navigation?.status() ?? 200;
    if (status === 401 || status === 403) throw refusal(await page.content(), "cf-mitigated" in (navigation?.headers() ?? {}));
    const contentType = navigation?.headers()["content-type"] ?? "text/html";
    const text = contentType.includes("html") ? await timed(steps, `${step}SettledMs`, () => settledText(page)) : (await navigation!.text()).slice(0, maximumResponseCharacters + 1);
    span.setAttribute("page.text.size", text.length);
    return { status, text };
  });
}

function httpError(method: string, url: string, status: number) {
  return new TaskError("http_error", `${status >= 500 ? retryOnce : ""}${method} ${withoutQuery(url)} returned ${status}`);
}

async function unfollowedRedirect(page: Page, website: string, method: string, url: string) {
  await page.goto(website, { waitUntil: "domcontentloaded", timeout: requestTimeout });
  if (looksSignedOut(page.url())) return signedOut();
  return new TaskError("fetch_failed", `${method} ${withoutQuery(url)} redirected, so MCParrot did not follow it.`);
}

async function readRequest(page: Page, website: string, request: FilledRequest, steps: RunSteps, step: string, keepFields: string[]) {
  const { method, url } = request;
  const response = await fetchInPage(page, request);
  if (response.failed === "redirected") throw await unfollowedRedirect(page, website, method, url);
  if (response.failed === "timeout") throw new TaskError("timeout", `${retryOnce}${method} ${withoutQuery(url)} took longer than ${requestTimeout / 1000} seconds.`);
  if (response.redirected && looksSignedOut(response.url)) throw signedOut();
  if (response.status === 401 || response.status === 403) throw refusal(response.body, response.mitigated);
  if (response.redirected && !isOnWebsite(response.url, website)) throw new TaskError("off_site", `${doNotRetry}This address redirects off the website ${website}, so MCParrot did not read it.`);
  if (response.status >= 400) throw httpError(method, url, response.status);
  if (response.failed && method !== "GET") throw new TaskError("fetch_failed", `${retryOnce}${method} ${withoutQuery(url)} could not be sent.`);
  if (!response.failed && !(method === "GET" && response.contentType.includes("html"))) return { body: response.body, status: response.status, summary: `${method} ${url} returned ${response.status}\n${compactAnswer(response.body, keepFields)}` };
  return readPageAt(page, website, url, steps, step);
}

async function readPageAt(page: Page, website: string, url: string, steps: RunSteps, step: string) {
  const { status, text } = await timed(steps, `${step}PageReadMs`, () => readPageText(page, website, url, steps, step));
  if (status >= 400) throw httpError("GET", url, status);
  return { body: text, status, summary: `GET ${url} returned ${status}\n${compactAnswer(text)}` };
}

const graphqlPath = /\/(api\/)?graphql(?:[?#]|$)/;

const needsHomePage = (requests: TaskRequest[]) => requests.some((request) => request.method.toUpperCase() !== "GET" || graphqlPath.test(request.urlPattern) || !!request.tokenHeaders?.length);

async function openBlankPage(page: Page, website: string) {
  const address = website + blankPagePath;
  await page.route(address, (route) => route.fulfill({ contentType: "text/html", body: "" }));
  await page.goto(address, { waitUntil: "domcontentloaded", timeout: requestTimeout }).catch(() => page.goto(`${website}/robots.txt`, { waitUntil: "domcontentloaded", timeout: requestTimeout }));
}

const openWebsite = (page: Page, website: string, homePage: boolean) => Sentry.startSpan({ name: "page.open_website", attributes: { "page.home": homePage } }, async () => {
  if (homePage) await page.goto(website, { waitUntil: "domcontentloaded", timeout: requestTimeout });
  else await openBlankPage(page, website);
});

async function readRequests(page: Page, website: string, requests: RequestFiller[], steps: RunSteps, keepFields: string[], homePage: boolean, everyAnswer: boolean) {
  steps.homePage = homePage;
  await timed(steps, "websiteOpenMs", () => openWebsite(page, website, homePage));
  requireOnWebsite(page, website);
  const responses: string[] = [];
  const results = [];
  for (const [index, fill] of requests.entries()) {
    const request = fill(responses);
    if (new URL(page.url()).origin !== website) await openWebsite(page, website, homePage);
    const step = `request${index + 1}`;
    const last = index === requests.length - 1;
    const { body, status, summary } = await timed(steps, `${step}Ms`, () => readRequest(page, website, request, steps, step, last ? keepFields : []));
    responses.push(body);
    results.push(last || everyAnswer ? summary : `${request.method} ${withoutQuery(request.url)} returned ${status}`);
  }
  return results.join("\n\n");
}

function readImage(page: Page, url: string, website?: string) {
  return Sentry.startSpan({ name: "image.read" }, async (span) => {
    const navigation = await page.goto(url, { waitUntil: "load", timeout: requestTimeout });
    if (website) requireOnWebsite(page, website);
    const status = navigation?.status() ?? 200;
    if (website && (status === 401 || status === 403)) throw refusal(await page.content(), "cf-mitigated" in (navigation?.headers() ?? {}));
    if (status >= 400) throw httpError("GET", url, status);
    const contentType = navigation?.headers()["content-type"]?.split(";")[0].trim().toLowerCase() ?? "";
    if (!imageTypes.includes(contentType)) throw new TaskError("not_image", `${withoutQuery(url)} is not a PNG, JPEG, WebP, or GIF image, so MCParrot did not read it.`);
    const dataUrl = await page.evaluate(async (maximumSide) => {
      const image = document.querySelector("img")!;
      await image.decode();
      const scale = Math.min(1, maximumSide / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(image.naturalWidth * scale);
      canvas.height = Math.round(image.naturalHeight * scale);
      const context = canvas.getContext("2d")!;
      context.fillStyle = "white";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/jpeg", 0.9);
    }, maximumImageSide);
    span.setAttribute("image.data.size", dataUrl.length);
    if (dataUrl.length > maximumImageCharacters) throw new TaskError("image_too_large", "This image is too large for MCParrot to read, even after shrinking it.");
    return dataUrl;
  });
}

async function inSignedInBrowser(app: Website, steps: RunSteps, read: (page: Page) => Promise<string>) {
  if (!app.browserProfileId) throw signedOut();
  return withWarmPage(app.id, app.browserProfileId, steps, read);
}

const runRequests = (app: Website, requests: RequestFiller[], steps: RunSteps, keepFields: string[], homePage: boolean, everyAnswer: boolean) => inSignedInBrowser(app, steps, (page) => readRequests(page, new URL(app.url).origin, requests, steps, keepFields, homePage, everyAnswer));

function failureReason(error: Error): Reason {
  if (error instanceof TaskError) return error.reason;
  if (error.message === signedOutMessage) return "signed_out";
  if (error.name === "TimeoutError" || /timeout/i.test(error.message)) return "timeout";
  if (error.message.startsWith("page.goto")) return "navigation_failed";
  if (/failed to fetch/i.test(error.message)) return "fetch_failed";
  return "failed";
}

function logOutcome(name: string, attributes: Record<string, string | number | boolean>, read: (steps: RunSteps) => Promise<string>) {
  return Sentry.startSpan({ name: "task.run", attributes: { "task.kind": name } }, async () => {
    const steps: RunSteps = {};
    try {
      const result = await timed(steps, "totalMs", () => read(steps));
      Sentry.logger.info(`${name} finished`, { ...attributes, ...steps, resultSize: result.length });
      return result;
    } catch (error) {
      const reason = failureReason(error as Error);
      Sentry.logger.warn(`${name} failed`, { ...attributes, ...steps, signedOut: reason === "signed_out", reason });
      if (error instanceof TaskError) throw error;
      throw new TaskError(reason, (reason === "timeout" || reason === "fetch_failed" ? retryOnce : "") + sanitized((error as Error).message));
    }
  });
}

export function runTask(app: Website, task: Task, inputs: TaskInputs, fullAnswer = false) {
  return logOutcome("Task", { appId: app.id, task: task.name, requestCount: task.requests.length }, (steps) => {
    const values: TaskInputs = Object.fromEntries(task.inputs.map((input) => [input.name, inputs[input.name] ?? input.example]));
    return runRequests(app, task.requests.map((request) => (responses) => filledRequest(app, request, values, responses)), steps, fullAnswer ? [] : task.keepFields ?? [], needsHomePage(task.requests), fullAnswer);
  });
}

export function addressOnWebsite(app: Website, url: string) {
  const website = new URL(app.url).origin;
  const address = new URL(url, website);
  if (!isOnWebsite(address, website)) throw new TaskError("off_site", `MCParrot only uses pages on ${website}. Give an address on that website or a path such as /courses.`);
  return address;
}

const pageLinks = (page: Page) => page.evaluate(({ maximumLinks, maximumImages, textCharacters }) => {
  const links = new Map<string, string>();
  for (const link of document.querySelectorAll("a[href]")) {
    const address = new URL((link as HTMLAnchorElement).href, location.href);
    const path = address.pathname + address.search;
    const text = ((link as HTMLElement).innerText || link.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim().slice(0, textCharacters);
    if (address.origin === location.origin && text && path !== location.pathname + location.search && !links.has(path)) links.set(path, text);
    if (links.size >= maximumLinks) break;
  }
  const images = [...new Set([...document.images].map((image) => image.currentSrc || image.src).filter((source) => /^https?:/.test(source)))].slice(0, maximumImages);
  return [links.size ? `Links on this page (text -> path):\n${[...links].map(([path, text]) => `${text} -> ${path}`).join("\n")}` : "", images.length ? `Images on this page:\n${images.join("\n")}` : ""].filter(Boolean).join("\n\n");
}, { maximumLinks: maximumPageLinks, maximumImages: maximumPageImages, textCharacters: linkTextCharacters });

async function readWholePage(page: Page, website: string, url: string, steps: RunSteps) {
  const { status, text } = await timed(steps, "request1PageReadMs", () => readPageText(page, website, url, steps, "request1"));
  if (status >= 400) throw httpError("GET", url, status);
  const links = await pageLinks(page).catch(() => "");
  return `GET ${url} returned ${status}\n${compactAnswer(links ? `${links}\n\n${text}` : text)}`;
}

export function readPage(app: Website, url: string) {
  const address = addressOnWebsite(app, url);
  const website = new URL(app.url).origin;
  return logOutcome("Page read", { appId: app.id }, (steps) => inSignedInBrowser(app, steps, (page) => timed(steps, "request1Ms", () => readWholePage(page, website, address.href, steps))));
}

async function inEmptyContext(page: Page, read: (page: Page) => Promise<string>) {
  const context = await page.context().browser()!.newContext();
  try {
    return await read(await context.newPage());
  } finally {
    await context.close().catch(() => undefined);
  }
}

export function readImageDataUrl(app: Website, url: string) {
  const website = new URL(app.url).origin;
  const address = new URL(url, website);
  if (isOnWebsite(address, website)) return logOutcome("Image read", { appId: app.id }, (steps) => inSignedInBrowser(app, steps, (page) => readImage(page, address.href, website)));
  if (address.protocol !== "https:") throw new TaskError("off_site", `MCParrot only opens images on ${website} or at https addresses on other websites.`);
  return logOutcome("Image read", { appId: app.id, offSite: true }, (steps) => inSignedInBrowser(app, steps, (page) => inEmptyContext(page, (emptyPage) => readImage(emptyPage, address.href))));
}
