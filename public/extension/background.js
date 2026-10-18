const dashboardOrigins = ["https://mcparrot.vercel.app", "http://localhost:4317", "http://127.0.0.1:4317"];
const maximumRequests = 150;
const maximumStringLength = 80;
const maximumArrayItems = 2;
const maximumSampleLength = 3000;
const maximumTextSampleLength = 400;
const dataResourceTypes = ["XHR", "Fetch", "EventSource"];
const dataContentType = /json|xml|graphql/i;
const authenticationPath = /\b(log-?in|log-?out|sign-?in|sign-?out|auth|authorize|oauth2?|token|session|password|sso|saml|cas)\b/i;
const analyticsHost = /google-analytics|googletagmanager|doubleclick|segment\.(io|com)|mixpanel|sentry\.io|hotjar|amplitude|newrelic|nr-data|datadoghq|fullstory|clarity\.ms|heapanalytics|facebook\.net/i;
const secretParameter = /token|key|auth|password|secret|session|sig/i;
const pageSnapshot = `({ url: location.href, status: performance.getEntriesByType("navigation")[0]?.responseStatus ?? 0, contentType: document.contentType, text: document.body?.innerText ?? "" })`;
const pendingRequests = new Map();
let updates = Promise.resolve();

function update(operation) {
  const result = updates.then(operation);
  updates = result.catch(() => {});
  return result;
}

function shorten(value) {
  if (typeof value === "string") return value.length > maximumStringLength ? `${value.slice(0, maximumStringLength)}…` : value;
  if (Array.isArray(value)) return value.slice(0, maximumArrayItems).map(shorten);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, shorten(item)]));
  return value;
}

function sampleOf(text) {
  try {
    return JSON.stringify(shorten(JSON.parse(text))).slice(0, maximumSampleLength);
  } catch {
    return text.slice(0, maximumTextSampleLength);
  }
}

function withoutSecrets(href) {
  const url = new URL(href);
  for (const name of [...url.searchParams.keys()]) if (secretParameter.test(name)) url.searchParams.set(name, "redacted");
  return url.href;
}

function pathPattern(url) {
  return url.pathname.split("/").map((segment) => /^\d+$|^[0-9a-f-]{32,36}$/i.test(segment) ? "{id}" : segment).join("/");
}

function rememberRequest({ requestId, request }) {
  const url = new URL(request.url);
  if (!url.protocol.startsWith("http") || analyticsHost.test(url.hostname) || authenticationPath.test(url.pathname)) return;
  pendingRequests.set(requestId, { method: request.method, url: withoutSecrets(request.url), pattern: url.origin + pathPattern(url) });
}

function rememberResponse({ requestId, type, response }) {
  const request = pendingRequests.get(requestId);
  if (!request) return;
  if (!dataResourceTypes.includes(type) && !dataContentType.test(response.mimeType)) return pendingRequests.delete(requestId);
  request.status = response.status;
  request.contentType = response.mimeType;
}

function save(tabId, captured) {
  return update(async () => {
    const { active } = await chrome.storage.session.get("active");
    const { explorations = {} } = await chrome.storage.local.get("explorations");
    if (active?.tabId !== tabId) return;
    const requests = explorations[active.appId] ?? [];
    if (requests.length >= maximumRequests || requests.some(({ method, pattern }) => method === captured.method && pattern === captured.pattern)) return;
    explorations[active.appId] = [...requests, captured];
    await chrome.storage.local.set({ explorations });
  });
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
  if (!url.protocol.startsWith("http") || authenticationPath.test(url.pathname)) return;
  const sample = page.text.replace(/\s+/g, " ").trim().slice(0, maximumSampleLength);
  await save(tabId, { kind: "page", method: "GET", url: withoutSecrets(page.url), pattern: url.origin + pathPattern(url), status: page.status, contentType: page.contentType, sample });
}

chrome.debugger.onEvent.addListener((source, method, params) => {
  if (method === "Page.loadEventFired") void recordPage(source.tabId);
  if (method === "Network.requestWillBeSent") rememberRequest(params);
  if (method === "Network.responseReceived") rememberResponse(params);
  if (method === "Network.loadingFailed") pendingRequests.delete(params.requestId);
  if (method === "Network.loadingFinished") void recordRequest(source.tabId, params.requestId);
});

async function status(appId) {
  const { active } = await chrome.storage.session.get("active");
  const { explorations = {} } = await chrome.storage.local.get("explorations");
  return { recording: active?.appId === appId, requests: explorations[appId] ?? [] };
}

async function startRecording(appId, websiteUrl) {
  const { active } = await chrome.storage.session.get("active");
  if (active) throw new Error("Stop your current exploration before opening another.");
  if (!/^https?:\/\//.test(websiteUrl)) throw new Error("The app needs a website address that starts with http or https.");
  const tab = await chrome.tabs.create({ url: "about:blank" });
  await chrome.debugger.attach({ tabId: tab.id }, "1.3");
  await chrome.debugger.sendCommand({ tabId: tab.id }, "Network.enable");
  await chrome.debugger.sendCommand({ tabId: tab.id }, "Page.enable");
  await chrome.storage.session.set({ active: { appId, tabId: tab.id } });
  await chrome.tabs.update(tab.id, { url: websiteUrl });
}

async function stopRecording(tabId) {
  await chrome.debugger.detach({ tabId }).catch(() => {});
  await chrome.storage.session.remove("active");
  pendingRequests.clear();
}

async function operate({ action, appId, websiteUrl }) {
  if (action === "start") await startRecording(appId, websiteUrl);
  if (action === "status" || action === "start") return status(appId);
  const { active } = await chrome.storage.session.get("active");
  if (active?.appId === appId) await stopRecording(active.tabId);
  if (action === "clear") {
    const { explorations = {} } = await chrome.storage.local.get("explorations");
    delete explorations[appId];
    await chrome.storage.local.set({ explorations });
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
