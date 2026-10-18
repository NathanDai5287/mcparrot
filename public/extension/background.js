const dashboardOrigins = ["https://mcparrot.vercel.app", "http://localhost:4317", "http://127.0.0.1:4317"];
const maximumRequests = 150;
const maximumStringLength = 80;
const maximumArrayItems = 2;
const maximumSampleLength = 3000;
const maximumTextSampleLength = 400;
const maximumUrlLength = 1000;
const retentionDays = 30;
const dataResourceTypes = ["XHR", "Fetch", "EventSource"];
const dataContentType = /json|xml|graphql/i;
const authenticationWords = new Set(["login", "logout", "signin", "signout", "auth", "authorize", "oauth", "oauth2", "token", "session", "password", "sso", "saml", "saml2", "cas", "refresh", "otp", "mfa", "verify"]);
const analyticsHost = /google-analytics|googletagmanager|doubleclick|segment\.(io|com)|mixpanel|sentry\.io|hotjar|amplitude|newrelic|nr-data|datadoghq|fullstory|clarity\.ms|heapanalytics|facebook\.net/i;
const secretParameterWords = new Set(["token", "key", "apikey", "auth", "password", "passwd", "pwd", "secret", "session", "sessionid", "sid", "sig", "signature", "verifier", "code", "state", "ticket", "jwt", "nonce", "otp", "credential", "csrf", "xsrf", "bearer", "assertion", "samlresponse"]);
const secretKeyWords = new Set(["auth", "session", "refresh", "access"]);
const secretKeyText = /token|secret|password|passwd|api[_-]?key|csrf|xsrf|jwt|bearer|cookie|credential|signature/i;
const jwtText = /eyJ[\w-]{5,}\.[\w-]{5,}\.[\w-]*/g;
const bearerText = /\bbearer\s+[\w\-.~+/]+=*/gi;
const secretAssignmentText = /\b([\w-]*(?:token|secret|password|passwd|api[_-]?key|csrf|xsrf|jwt|session[_-]?id|sessionid|credential|signature)[\w-]*)(["']?\s*[:=]\s*["']?)([^\s"'&,;}]+)/gi;
const longValueText = /[\w+=\-~]{32,}/g;
const pageSnapshot = `({ url: location.href, status: performance.getEntriesByType("navigation")[0]?.responseStatus ?? 0, contentType: document.contentType, text: document.body?.innerText ?? "" })`;
const pendingRequests = new Map();
let updates = Promise.resolve();

function update(operation) {
  const result = updates.then(operation);
  updates = result.catch(() => {});
  return result;
}

function wordsOf(name) {
  return name.replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2").replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

function hasWord(words, set) {
  const has = (word) => set.has(word) || set.has(word.replace(/s$/, ""));
  return words.some((word, index) => has(word) || (index > 0 && has(words[index - 1] + word)));
}

function isAuthenticationPath(pathname) {
  return hasWord(wordsOf(pathname), authenticationWords);
}

function isSecretKey(key) {
  return secretKeyText.test(key) || hasWord(wordsOf(key), secretKeyWords);
}

function isHighEntropy(text) {
  if (text.length < 32 || !/^[\w+=\-~]+$/.test(text) || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text)) return false;
  const hex = /^[0-9a-f]+$/i.test(text);
  if (!hex && !(/[a-z]/.test(text) && /[A-Z]/.test(text) && /\d/.test(text))) return false;
  const counts = {};
  for (const character of text) counts[character] = (counts[character] ?? 0) + 1;
  const entropy = Object.values(counts).reduce((total, count) => total - (count / text.length) * Math.log2(count / text.length), 0);
  return entropy >= (hex ? 3 : 3.5);
}

function looksSecret(text) {
  return /^\s*bearer\s/i.test(text) || new RegExp(`^${jwtText.source}$`).test(text) || isHighEntropy(text);
}

function redactText(text) {
  return text.replace(jwtText, "redacted").replace(bearerText, "Bearer redacted").replace(secretAssignmentText, "$1$2redacted").replace(longValueText, (value) => isHighEntropy(value) ? "redacted" : value);
}

function redact(value, key = "") {
  if (key && isSecretKey(key) && value !== null && value !== "" && typeof value !== "boolean") return "redacted";
  if (typeof value === "string") return looksSecret(value) ? "redacted" : redactText(value);
  if (Array.isArray(value)) return value.map((item) => redact(item));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, redact(item, name)]));
  return value;
}

function shorten(value) {
  if (typeof value === "string") return value.length > maximumStringLength ? `${value.slice(0, maximumStringLength)}…` : value;
  if (Array.isArray(value)) return value.slice(0, maximumArrayItems).map(shorten);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, shorten(item)]));
  return value;
}

function sampleOf(text) {
  try {
    return JSON.stringify(shorten(redact(JSON.parse(text)))).slice(0, maximumSampleLength);
  } catch {
    return redactText(text.slice(0, maximumTextSampleLength * 2)).slice(0, maximumTextSampleLength);
  }
}

function withoutSecrets(href) {
  const url = new URL(href);
  url.hash = "";
  url.pathname = url.pathname.split("/").map((segment) => isSecretSegment(segment) ? "redacted" : segment).join("/");
  for (const [name, value] of [...url.searchParams]) if (hasWord(wordsOf(name), secretParameterWords) || looksSecret(value)) url.searchParams.set(name, "redacted");
  return url.href.slice(0, maximumUrlLength);
}

function isSecretSegment(segment) {
  try {
    return looksSecret(decodeURIComponent(segment));
  } catch {
    return looksSecret(segment);
  }
}

function pathPattern(url) {
  return url.pathname.split("/").map((segment) => /^\d+$|^[0-9a-f-]{32,36}$/i.test(segment) || isSecretSegment(segment) ? "{id}" : segment).join("/").slice(0, maximumUrlLength);
}

function rememberRequest({ requestId, request }) {
  const url = new URL(request.url);
  if (!url.protocol.startsWith("http") || analyticsHost.test(url.hostname) || isAuthenticationPath(url.pathname)) return;
  pendingRequests.set(requestId, { method: request.method, url: withoutSecrets(request.url), pattern: url.origin + pathPattern(url) });
}

function rememberResponse({ requestId, type, response }) {
  const request = pendingRequests.get(requestId);
  if (!request) return;
  if (!dataResourceTypes.includes(type) && !dataContentType.test(response.mimeType)) return pendingRequests.delete(requestId);
  request.status = response.status;
  request.contentType = response.mimeType;
}

const explorationKey = (appId) => `explorations:${appId}`;

async function readRequests(appId) {
  const key = explorationKey(appId);
  const { [key]: exploration } = await chrome.storage.local.get(key);
  return exploration?.requests ?? [];
}

async function tidyStorage() {
  const stored = await chrome.storage.local.get(null);
  const now = Date.now();
  if (stored.explorations) {
    await chrome.storage.local.set(Object.fromEntries(Object.entries(stored.explorations).map(([appId, requests]) => [explorationKey(appId), { recordedAt: now, requests }])));
    await chrome.storage.local.remove("explorations");
  }
  const { active } = await chrome.storage.session.get("active");
  const expired = Object.entries(stored).filter(([key, value]) => key.startsWith("explorations:") && key !== explorationKey(active?.appId) && !(now - (value?.recordedAt ?? 0) < retentionDays * 86400000)).map(([key]) => key);
  if (expired.length) await chrome.storage.local.remove(expired);
}

function save(tabId, captured) {
  return update(async () => {
    const { active } = await chrome.storage.session.get("active");
    if (active?.tabId !== tabId) return;
    const requests = await readRequests(active.appId);
    if (requests.length >= maximumRequests || requests.some(({ method, pattern }) => method === captured.method && pattern === captured.pattern)) return;
    await chrome.storage.local.set({ [explorationKey(active.appId)]: { recordedAt: Date.now(), requests: [...requests, captured] } });
  }).catch((error) => chrome.storage.session.set({ saveError: `Could not save a recorded request: ${error.message}` }));
}

async function recordRequest(tabId, requestId) {
  const request = pendingRequests.get(requestId);
  pendingRequests.delete(requestId);
  if (!request?.contentType) return;
  const body = await chrome.debugger.sendCommand({ tabId }, "Network.getResponseBody", { requestId }).catch(() => undefined);
  await save(tabId, { ...request, sample: body && !body.base64Encoded ? sampleOf(body.body) : "" });
}

async function recordPage(tabId) {
  const evaluation = await chrome.debugger.sendCommand({ tabId }, "Runtime.evaluate", { expression: pageSnapshot, returnByValue: true }).catch(() => undefined);
  const page = evaluation?.result?.value;
  if (page?.contentType !== "text/html") return;
  const url = new URL(page.url);
  if (!url.protocol.startsWith("http") || isAuthenticationPath(url.pathname)) return;
  const sample = redactText(page.text.replace(/\s+/g, " ").trim().slice(0, maximumSampleLength * 2)).slice(0, maximumSampleLength);
  await save(tabId, { kind: "page", method: "GET", url: withoutSecrets(page.url), pattern: url.origin + pathPattern(url), status: page.status, contentType: page.contentType, sample });
}

chrome.debugger.onEvent.addListener((source, method, params) => {
  if (method === "Page.loadEventFired") void recordPage(source.tabId).catch(() => {});
  if (method === "Network.requestWillBeSent") rememberRequest(params);
  if (method === "Network.responseReceived") rememberResponse(params);
  if (method === "Network.loadingFailed") pendingRequests.delete(params.requestId);
  if (method === "Network.loadingFinished") void recordRequest(source.tabId, params.requestId).catch(() => {});
});

async function status(appId) {
  const { active, saveError = "" } = await chrome.storage.session.get(["active", "saveError"]);
  return { recording: active?.appId === appId, requests: await readRequests(appId), activeAppId: active?.appId ?? null, saveError };
}

async function startRecording(appId, websiteUrl) {
  const { active } = await chrome.storage.session.get("active");
  if (active) throw new Error("Stop your current exploration before opening another.");
  if (!/^https?:\/\//.test(websiteUrl)) throw new Error("The app needs a website address that starts with http or https.");
  await chrome.storage.session.remove("saveError");
  const tab = await chrome.tabs.create({ url: "about:blank" });
  try {
    await chrome.debugger.attach({ tabId: tab.id }, "1.3");
    await chrome.debugger.sendCommand({ tabId: tab.id }, "Network.enable");
    await chrome.debugger.sendCommand({ tabId: tab.id }, "Page.enable");
  } catch (error) {
    await chrome.debugger.detach({ tabId: tab.id }).catch(() => {});
    await chrome.tabs.remove(tab.id).catch(() => {});
    throw error;
  }
  await chrome.storage.session.set({ active: { appId, tabId: tab.id } });
  await chrome.tabs.update(tab.id, { url: websiteUrl });
}

async function stopRecording(tabId) {
  await chrome.debugger.detach({ tabId }).catch(() => {});
  await chrome.storage.session.remove("active");
  pendingRequests.clear();
}

async function operate({ action, appId, websiteUrl }) {
  await tidyStorage();
  if (action === "start") await startRecording(appId, websiteUrl);
  if (action === "status" || action === "start") return status(appId);
  const { active } = await chrome.storage.session.get("active");
  if (active && (action === "stop" || active.appId === appId)) await stopRecording(active.tabId);
  if (action === "clear") {
    await chrome.storage.local.remove(explorationKey(appId));
    await chrome.storage.session.remove("saveError");
  }
  return status(appId);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!dashboardOrigins.includes(new URL(sender.url ?? "about:blank").origin)) return;
  if (!["status", "start", "stop", "clear"].includes(message.action) || !/^[a-zA-Z0-9-]{1,80}$/.test(message.appId)) return;
  update(() => operate(message)).then((state) => sendResponse({ state }), (error) => sendResponse({ error: error.message }));
  return true;
});

chrome.debugger.onDetach.addListener(({ tabId }) => {
  void update(async () => {
    const { active } = await chrome.storage.session.get("active");
    if (active?.tabId === tabId) await chrome.storage.session.remove("active");
  });
});
