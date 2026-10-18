import * as Sentry from "@sentry/nextjs";
import type { Page } from "playwright-core";
import { timed, withWarmPage, type RunSteps } from "./browser-use";
import { compactAnswer } from "./compact-answer";
import type { Task, TaskRequest, TokenHeader, Website } from "./capabilities";
import { isAllowedRequest, isOnWebsite, paymentRefusal, replaceBodyPlaceholders, replayedHeaders, stepPlaceholderPattern, urlPlaceholderPattern, type BodyPlace, type PlaceholderReplacer } from "./task-request";

const maximumResponseCharacters = 100_000;
const compactedResponseCharacters = 1_000_000;
const requestTimeout = 30_000;
const networkQuietTimeout = 5_000;
const shortPageWait = 2_000;
const navigationGrace = 1_000;
const pageLoadTimeout = requestTimeout - networkQuietTimeout - shortPageWait;
const shortPageCharacters = 200;
const runBudget = 250_000;
const stepReserve = 2 * requestTimeout;
const imageTypes = ["image/png", "image/jpeg", "image/jpg", "image/pjpeg", "image/webp", "image/gif", "image/avif"];
const maximumImageSide = 1600;
const maximumImageCharacters = 1_500_000;
const botChallenge = /just a moment|cf-chl|challenge-platform|captcha|prove your humanity|kpsdk|kasada|akamai/i;
const csrfRefusal = /forgery|invalid authenticity token|csrf[^<\n]{0,40}(fail|invalid|missing|mismatch|expired)|(invalid|missing|bad)[^<\n]{0,20}csrf/i;
const csrfPageSelectors = ["meta[name=csrf-token]", "meta[name=csrf_token]", "meta[name=_csrf]", "input[name=csrfmiddlewaretoken]", "input[name=authenticity_token]"];
const signInPart = /^(log[-_]?in|sign[-_]?in|sso|saml\d?)(\.\w+)?$/i;
const dotSegment = /^(\.|%2e){1,2}$/i;
const jsonLiteral = /^(-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?|true|false|null)$/;
export const signedOutMessage = "The website is signed out. Open MCParrot, then select Sign in to website on this app, or choose how it signs in again automatically, then try again.";

const blockedMessage = "The website blocked the automated browser with a bot check, so MCParrot could not read this address. Try again later.";
const csrfRefusedMessage = "The website refused the request because its protection code was missing or wrong. Record this page again with MCParrot Explorer, then select Find what this site can do.";
const outOfTimeMessage = "This call ran out of time, so MCParrot stopped it. If the tool changes something on the website, check the website before trying again.";

type TaskInputs = Record<string, string | undefined>;

type Reason = "signed_out" | "blocked" | "csrf_refused" | "navigation_failed" | "fetch_failed" | "timeout" | "http_error" | "off_site" | "missing_input" | "missing_step_value" | "refused" | "not_image" | "image_too_large" | "bad_input" | "failed";

type FilledRequest = { method: string; url: string; body?: string; contentType?: string; headers?: Record<string, string>; tokenHeaders?: TokenHeader[] };

type StepResponse = { body: string; truncated: boolean };

type RequestFiller = (responses: StepResponse[]) => FilledRequest;

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

const exactIntegers = (_key: string, value: unknown, context?: { source: string }) => typeof value === "number" && !Number.isSafeInteger(value) && context && /^-?\d+$/.test(context.source) ? (JSON as JSON & { rawJSON: (text: string) => unknown }).rawJSON(context.source) : value;

const valueAt = (value: unknown, key: string) => value !== null && typeof value === "object" && Object.hasOwn(value, key) ? (value as Record<string, unknown>)[key] : undefined;

function parsedResponse(responses: StepResponse[], step: number, placeholder: string) {
  if (step < 1 || step > responses.length) throw new TaskError("missing_step_value", `Step ${step} has not run yet, so this tool could not fill ${placeholder}.`);
  const { body, truncated } = responses[step - 1];
  if (truncated) throw new TaskError("missing_step_value", `The response of step ${step} is longer than ${maximumResponseCharacters.toLocaleString("en-US")} characters, so this tool could not fill ${placeholder}.`);
  try {
    return JSON.parse(body, exactIntegers) as unknown;
  } catch {
    throw new TaskError("missing_step_value", `Step ${step} did not return JSON, so this tool could not fill ${placeholder}.`);
  }
}

function stepValue(responses: StepResponse[], step: number, path: string) {
  const placeholder = `{step${step}.${path}}`;
  const value = path.split(".").reduce(valueAt, parsedResponse(responses, step, placeholder));
  if (value === undefined || value === null) throw new TaskError("missing_step_value", `The response of step ${step} has no value at ${path}, so this tool could not fill ${placeholder}.`);
  return value;
}

const asText = (value: unknown) => typeof value === "string" ? value : JSON.stringify(value);

const urlEncoded = (value: unknown) => encodeURIComponent(asText(value));

function jsonEncoded(value: unknown, { inString, inGraphql }: BodyPlace) {
  if (inGraphql) return jsonEscaped(jsonEscaped(asText(value)));
  if (inString) return jsonEscaped(asText(value));
  return typeof value === "string" && jsonLiteral.test(value) ? value : JSON.stringify(value);
}

const outsideString: BodyPlace = { inString: false, inGraphql: false };

function fillPattern(fill: (replace: PlaceholderReplacer) => string, values: TaskInputs, responses: StepResponse[], encode: (value: unknown, place: BodyPlace) => string) {
  const missing = new Set<string>();
  const filled = fill((name, match, place) => {
    const step = name.match(stepPlaceholderPattern);
    if (step) return encode(stepValue(responses, Number(step[1]), step[2]), place);
    const value = Object.hasOwn(values, name) ? values[name] : undefined;
    if (value === undefined) {
      missing.add(name);
      return match;
    }
    return encode(value, place);
  });
  if (missing.size) throw new TaskError("missing_input", `This tool needs a value for ${[...missing].join(", ")}.`);
  return filled;
}

const dotSegments = (address: string) => address.replace(/^[a-z][a-z\d+.-]*:\/\/[^/?#]*/i, "").split(/[?#]/)[0].split("/").filter((part) => dotSegment.test(part)).length;

function filledRequest(app: Website, request: TaskRequest, values: TaskInputs, responses: StepResponse[]): FilledRequest {
  const filledUrl = fillPattern((replace) => request.urlPattern.replace(urlPlaceholderPattern, (match, name: string) => replace(name, match, outsideString)), values, responses, urlEncoded);
  if (dotSegments(filledUrl) > dotSegments(request.urlPattern)) throw new TaskError("bad_input", "A tool input or step value cannot be . or .. in an address, so MCParrot did not send this request.");
  const url = addressOnWebsite(app, filledUrl).href;
  const bodyEncoding = request.contentType?.toLowerCase().includes("x-www-form-urlencoded") ? urlEncoded : jsonEncoded;
  const { bodyPattern } = request;
  const body = bodyPattern === undefined ? undefined : fillPattern((replace) => replaceBodyPlaceholders(bodyPattern, replace), values, responses, bodyEncoding);
  if (!isAllowedRequest({ method: request.method, urlPattern: url, bodyPattern: body })) throw new TaskError("refused", paymentRefusal);
  return { method: request.method.toUpperCase(), url, body, contentType: body === undefined ? undefined : request.contentType ?? "application/json", headers: replayedHeaders(request.headers), tokenHeaders: request.tokenHeaders };
}

function signInParts(address: string) {
  const { hostname, pathname } = new URL(address);
  return [...hostname.split("."), ...pathname.split("/")].filter((part) => signInPart.test(part)).map((part) => part.toLowerCase());
}

function redirectedToSignIn(address: string, requested: string) {
  const requestedParts = new Set(signInParts(requested));
  return signInParts(address).some((part) => !requestedParts.has(part));
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

function requireOnWebsite(page: Page, website: string, requested: string) {
  if (redirectedToSignIn(page.url(), requested)) throw signedOut();
  if (!isOnWebsite(page.url(), website)) throw new TaskError("off_site", `This address left the website ${website}, so MCParrot did not read it.`);
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
        const carriesSecrets = Object.keys(tokens).length > 0 || Object.keys(csrfHeaders).length > 0;
        const signal = AbortSignal.timeout(timeout);
        const reply = await fetch(address, { method, body: requestBody, headers, redirect: method === "GET" && !carriesSecrets ? "follow" : "manual", credentials, signal });
        if (reply.type === "opaqueredirect") return { failed: "redirected", status: 0, url: address, redirected: false, mitigated: false, contentType: "", body: "", truncated: false };
        const contentType = reply.headers.get("content-type") ?? "";
        const html = method === "GET" && contentType.includes("html") && reply.status < 400;
        if (html) await reply.body?.cancel();
        const text = html ? "" : await reply.text();
        return { failed: "", status: reply.status, url: reply.url, redirected: reply.redirected, mitigated: reply.headers.has("cf-mitigated"), contentType, body: text.slice(0, limit), truncated: text.length > limit };
      } catch (error) {
        return { failed: (error as Error).name === "TimeoutError" ? "timeout" : "fetch_failed", status: 0, url: address, redirected: false, mitigated: false, contentType: "", body: "", truncated: false };
      }
    }, { request, csrfPageSelectors, limit: compactedResponseCharacters, timeout: requestTimeout });
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
    requireOnWebsite(page, website, url);
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
  if (redirectedToSignIn(page.url(), website)) return signedOut();
  return new TaskError("fetch_failed", `${method} ${withoutQuery(url)} redirected, so MCParrot did not follow it.`);
}

async function settledFetch(page: Page, website: string, request: FilledRequest) {
  const before = page.url();
  const response = await fetchInPage(page, request).catch((error: Error) => {
    if (page.url() === before && !/context was destroyed|navigat/i.test(error.message)) throw error;
    return undefined;
  });
  if (response && response.failed !== "fetch_failed") return response;
  await page.waitForURL((address) => address.href !== before, { waitUntil: "domcontentloaded", timeout: navigationGrace }).catch(() => undefined);
  if (response && page.url() === before) return response;
  requireOnWebsite(page, website, before);
  if (request.method !== "GET") throw new TaskError("fetch_failed", `${request.method} ${withoutQuery(request.url)} was interrupted when the page navigated, so MCParrot cannot tell whether the website applied it. Check the website before trying again.`);
  return fetchInPage(page, request);
}

async function readRequest(page: Page, website: string, request: FilledRequest, steps: RunSteps, step: string, keepFields: string[]) {
  const { method, url } = request;
  const response = await settledFetch(page, website, request);
  if (response.failed === "redirected") throw await unfollowedRedirect(page, website, method, url);
  if (response.failed === "timeout") throw new TaskError("timeout", `${method} ${withoutQuery(url)} took longer than ${requestTimeout / 1000} seconds.`);
  if (response.redirected && redirectedToSignIn(response.url, url)) throw signedOut();
  if (response.redirected && !isOnWebsite(response.url, website)) throw new TaskError("off_site", `This address redirects off the website ${website}, so MCParrot did not read it.`);
  if (response.status === 401 || response.status === 403) throw refusal(response.body, response.mitigated);
  if (response.status >= 400) throw httpError(method, url, response.status);
  if (response.failed && method !== "GET") throw new TaskError("fetch_failed", `${method} ${withoutQuery(url)} could not be sent.`);
  if (!response.failed && !(method === "GET" && response.contentType.includes("html"))) return { body: response.body.slice(0, maximumResponseCharacters), truncated: response.truncated || response.body.length > maximumResponseCharacters, summary: `${method} ${url} returned ${response.status}\n${compactAnswer(response.body, keepFields)}` };
  const { status, text } = await timed(steps, `${step}PageReadMs`, () => readPageText(page, website, url));
  if (status >= 400) throw httpError(method, url, status);
  const body = text.slice(0, maximumResponseCharacters);
  return { body, truncated: text.length > maximumResponseCharacters, summary: `${method} ${url} returned ${status}\n${compactAnswer(body)}` };
}

function landedOrigin(page: Page, website: string) {
  const landed = new URL(page.url());
  const site = new URL(website);
  const sameHost = landed.hostname.replace(/^www\./, "") === site.hostname.replace(/^www\./, "") && landed.port === site.port;
  return sameHost && isOnWebsite(landed, website) ? landed.origin : website;
}

function rebased(url: string, website: string, origin: string) {
  const address = new URL(url);
  return address.origin === website ? new URL(address.pathname + address.search + address.hash, origin).href : url;
}

async function readRequests(page: Page, website: string, requests: RequestFiller[], steps: RunSteps, keepFields: string[], deadline: number) {
  await timed(steps, "websiteOpenMs", () => Sentry.startSpan({ name: "page.open_website" }, () => page.goto(website, { waitUntil: "domcontentloaded", timeout: requestTimeout })));
  requireOnWebsite(page, website, website);
  const origin = landedOrigin(page, website);
  const responses: StepResponse[] = [];
  const results = [];
  for (const [index, fill] of requests.entries()) {
    if (deadline - Date.now() < stepReserve) throw new TaskError("timeout", `This tool ran out of time after ${index} of ${requests.length} requests.`);
    const filled = fill(responses);
    const request = { ...filled, url: rebased(filled.url, website, origin) };
    if (new URL(page.url()).origin !== origin) await page.goto(origin, { waitUntil: "domcontentloaded", timeout: requestTimeout });
    const step = `request${index + 1}`;
    const { body, truncated, summary } = await timed(steps, `${step}Ms`, () => readRequest(page, website, request, steps, step, index === requests.length - 1 ? keepFields : []));
    responses.push({ body, truncated });
    results.push(summary);
  }
  return results.join("\n\n");
}

function readImage(page: Page, url: string, website?: string) {
  return Sentry.startSpan({ name: "image.read" }, async (span) => {
    const navigation = await page.goto(url, { waitUntil: "load", timeout: requestTimeout }).catch((error: Error) => {
      if (/ERR_ABORTED|Download is starting/i.test(error.message)) throw new TaskError("not_image", `${withoutQuery(url)} downloads a file instead of showing an image, so MCParrot did not read it.`);
      throw error;
    });
    if (website) requireOnWebsite(page, website, url);
    const status = navigation?.status() ?? 200;
    if (website && (status === 401 || status === 403)) throw refusal(await page.content(), "cf-mitigated" in (navigation?.headers() ?? {}));
    if (status >= 400) throw httpError("GET", url, status);
    const contentType = navigation?.headers()["content-type"]?.split(";")[0].trim().toLowerCase() ?? "";
    if (!imageTypes.includes(contentType)) throw new TaskError("not_image", `${withoutQuery(url)} is not a PNG, JPEG, WebP, GIF, or AVIF image, so MCParrot did not read it.`);
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

async function untilDeadline(page: Page, deadline: number, signal: AbortSignal | undefined, read: () => Promise<string>) {
  let expire = () => {};
  const expired = new Promise<never>((_, reject) => {
    expire = () => {
      reject(new TaskError("timeout", outOfTimeMessage));
      void page.close().catch(() => undefined);
    };
  });
  if (signal?.aborted) {
    expire();
    return expired;
  }
  const timer = setTimeout(expire, deadline - Date.now());
  signal?.addEventListener("abort", expire, { once: true });
  try {
    return await Promise.race([read(), expired]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", expire);
  }
}

async function inSignedInBrowser(app: Website, steps: RunSteps, signal: AbortSignal | undefined, read: (page: Page, deadline: number) => Promise<string>) {
  const deadline = Date.now() + runBudget;
  if (!app.browserProfileId) throw signedOut();
  return withWarmPage(app.id, app.browserProfileId, steps, (page) => untilDeadline(page, deadline, signal, () => read(page, deadline)));
}

const runRequests = (app: Website, requests: RequestFiller[], steps: RunSteps, keepFields: string[] = [], signal?: AbortSignal) =>
  inSignedInBrowser(app, steps, signal, (page, deadline) => readRequests(page, new URL(app.url).origin, requests, steps, keepFields, deadline));

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
      throw new TaskError(reason, sanitized((error as Error).message));
    }
  });
}

export function runTask(app: Website, task: Task, inputs: TaskInputs, fullAnswer = false, signal?: AbortSignal) {
  return logOutcome("Task", { appId: app.id, task: task.name, requestCount: task.requests.length }, (steps) => {
    const values: TaskInputs = Object.fromEntries(task.inputs.map((input) => [input.name, inputs[input.name] ?? input.example]));
    return runRequests(app, task.requests.map((request) => (responses) => filledRequest(app, request, values, responses)), steps, fullAnswer ? [] : task.keepFields, signal);
  });
}

export function addressOnWebsite(app: Website, url: string) {
  const website = new URL(app.url).origin;
  const address = URL.parse(url, website);
  if (!address || !isOnWebsite(address, website)) throw new TaskError("off_site", `MCParrot only uses pages on ${website}. Give an address on that website or a path such as /courses.`);
  return address;
}

export function readPage(app: Website, url: string, signal?: AbortSignal) {
  const address = addressOnWebsite(app, url);
  return logOutcome("Page read", { appId: app.id }, (steps) => runRequests(app, [() => ({ method: "GET", url: address.href })], steps, [], signal));
}

async function inEmptyContext(page: Page, read: (page: Page) => Promise<string>) {
  const context = await page.context().browser()!.newContext();
  try {
    return await read(await context.newPage());
  } finally {
    await context.close().catch(() => undefined);
  }
}

export function readImageDataUrl(app: Website, url: string, signal?: AbortSignal) {
  const website = new URL(app.url).origin;
  const address = URL.parse(url, website);
  if (!address) throw new TaskError("bad_input", `${withoutQuery(url)} is not a valid address, so MCParrot did not read it.`);
  if (isOnWebsite(address, website)) return logOutcome("Image read", { appId: app.id }, (steps) => inSignedInBrowser(app, steps, signal, (page) => readImage(page, address.href, website)));
  if (address.protocol !== "https:") throw new TaskError("off_site", `MCParrot only opens images on ${website} or at https addresses on other websites.`);
  return logOutcome("Image read", { appId: app.id, offSite: true }, (steps) => inSignedInBrowser(app, steps, signal, (page) => inEmptyContext(page, (emptyPage) => readImage(emptyPage, address.href))));
}
