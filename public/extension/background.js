const dashboardOrigins = ["https://mcparrot.vercel.app", "http://localhost:4317", "http://127.0.0.1:4317"];
const maximumRequests = 150;
const maximumStringLength = 80;
const maximumArrayItems = 2;
const maximumSampleLength = 3000;
const maximumTextSampleLength = 400;
const maximumUrlLength = 2000;
const maximumBodyLength = 30000;
const maximumHeaderLength = 200;
const retentionDays = 30;
const tidyIntervalMilliseconds = 86400000;
const dataResourceTypes = ["XHR", "Fetch", "EventSource"];
const dataContentType = /json|xml|graphql/i;
const replayedHeaderNames = ["accept", "apollographql-client-name", "apollographql-client-version", "client-identifier", "github-verified-fetch", "notion-client-version", "x-apollo-operation-name", "x-channel-id", "x-client-identifier", "x-experience-id", "x-notion-active-user-header", "x-requested-with", "x-restli-protocol-version"];
const tokenHeaderName = /auth|token|jwt|session|api-?key/i;
const authenticationWords = new Set(["login", "logout", "signin", "signout", "auth", "authorize", "oauth", "oauth2", "token", "password", "sso", "saml", "saml2", "cas", "refresh", "otp", "mfa", "verify", "idp", "passcode"]);
const authenticationHost = /^(login|logon|signin|auth|sso|idp)\.|\.(okta|oktapreview|auth0)\.com$/i;
const analyticsHost = /google-analytics|googletagmanager|doubleclick|segment\.(io|com)|mixpanel|sentry\.io|hotjar|amplitude|newrelic|nr-data|datadoghq|fullstory|clarity\.ms|heapanalytics|facebook\.net/i;
const secretParameterWords = new Set(["token", "apikey", "accesskey", "auth", "password", "passwd", "pwd", "secret", "sid", "sig", "signature", "verifier", "ticket", "jwt", "nonce", "otp", "credential", "csrf", "xsrf", "bearer", "assertion", "samlresponse", "authorization"]);
const exactSecretParameters = new Set(["code", "key"]);
const secretKeyWords = new Set(["auth", "refresh", "access", "passcode", "pwd", "otp"]);
const sessionSecretNames = new Set(["session", "sessionid", "sessiontoken", "sessionkey", "sid", "jsessionid", "phpsessid"]);
const secretKeyText = /token|secret|password|passwd|api[_-]?key|csrf|xsrf|jwt|bearer|cookie|credential|signature/i;
const jwtText = /eyJ[\w-]{5,}\.[\w-]{5,}\.[\w-]*/g;
const bearerText = /\bbearer\s+[\w\-.~+/]+=*/gi;
const secretName = "(?:[\\w-]*(?:token|secret|password|passwd|api[_-]?key|csrf|xsrf|jwt|credential|signature|authorization)[\\w-]*|(?<![\\w-])(?:session[_-]?id|jsessionid|phpsessid)(?![\\w-]))";
const secretAssignmentText = new RegExp(`\\b(${secretName})(["']?\\s*[:=]\\s*)("[^"]*"|'[^']*'|<[^<>\\s]*>|(?:(?:basic|bearer|digest)\\s+)?[^\\s"'&,;}<]+)`, "gi");
const secretElementText = new RegExp(`(<(${secretName})\\b[^>]*>)[^<]*(</\\2\\s*>)`, "gi");
const longValueText = /[\w+=\-~]{32,}/g;
const secretStringArgumentText = new RegExp(`\\b(${secretName})(\\s*:\\s*)"[^"]*"`, "gi");
const graphqlDocument = /^\s*(query|mutation|subscription|fragment)\b|^\s*\{/;
const pageSnapshot = `({ url: location.href, status: performance.getEntriesByType("navigation")[0]?.responseStatus ?? 0, contentType: document.contentType, text: document.body?.innerText ?? "" })`;
const maximumTokenFieldDepth = 3;
const tokenSourcesOf = (values) => `(${findLocalStorageTokens})(${JSON.stringify(values)}, ${maximumTokenFieldDepth})`;
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

function isSessionSecretName(name) {
  return sessionSecretNames.has(name.toLowerCase().replace(/[^a-z0-9]/g, ""));
}

function isSecretKey(key) {
  return secretKeyText.test(key) || hasWord(wordsOf(key), secretKeyWords) || isSessionSecretName(key);
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
  return /^\s*(bearer|basic)\s/i.test(text) || new RegExp(`^${jwtText.source}$`).test(text) || isHighEntropy(text);
}

function redactText(text) {
  return text.replace(jwtText, "redacted").replace(bearerText, "Bearer redacted").replace(secretElementText, "$1redacted$3").replace(secretAssignmentText, (_, name, separator, value) => `${name}${separator}${/^["']/.test(value) ? `${value[0]}redacted${value[0]}` : "redacted"}`).replace(longValueText, (value) => isHighEntropy(value) ? "redacted" : value);
}

function redactGraphqlDocument(text) {
  return text.replace(jwtText, "redacted").replace(bearerText, "Bearer redacted").replace(secretStringArgumentText, '$1$2"redacted"').replace(longValueText, (value) => isHighEntropy(value) ? "redacted" : value);
}

function redact(value, key = "") {
  if (key && isSecretKey(key) && value !== null && value !== "" && typeof value !== "boolean") return "redacted";
  if (Array.isArray(value)) return value.map((item) => redact(item, key));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, redact(item, name)]));
  if (key === "query" && typeof value === "string" && graphqlDocument.test(value)) return redactGraphqlDocument(value);
  if (typeof value === "string") return looksSecret(value) ? "redacted" : redactText(value);
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

function bodyOf(text) {
  try {
    return JSON.stringify(redact(JSON.parse(text))).slice(0, maximumBodyLength);
  } catch {
    return redactText(text.slice(0, maximumBodyLength * 2)).slice(0, maximumBodyLength);
  }
}

function contentTypeOf(headers = {}) {
  return Object.entries(headers).find(([name]) => name.toLowerCase() === "content-type")?.[1]?.slice(0, 200);
}

function replayedHeaders(headers = {}) {
  return Object.fromEntries(Object.entries(headers).filter(([name, value]) => replayedHeaderNames.includes(name.toLowerCase()) && value.length <= maximumHeaderLength && !looksSecret(value)));
}

function findLocalStorageTokens(values, maximumDepth) {
  const parsed = (text) => {
    try {
      return JSON.parse(text);
    } catch {
      return undefined;
    }
  };
  const pathTo = (data, token, depth) => {
    if (data === token) return [];
    if (depth === maximumDepth || !data || typeof data !== "object") return undefined;
    for (const [field, item] of Object.entries(data)) {
      const path = pathTo(item, token, depth + 1);
      if (path) return [field, ...path];
    }
    return undefined;
  };
  const sourceOf = (value, key, text) => {
    const [, prefix = "", token = value] = value.match(/^((?:bearer|token|jwt)\s+)(\S.*)$/i) ?? [];
    if (text === value) return { key };
    if (text === token) return { key, prefix };
    const path = pathTo(parsed(text), token, 0);
    return path?.length ? { key, prefix, path: path.join(".") } : undefined;
  };
  const stored = Object.keys(localStorage).map((key) => [key, localStorage.getItem(key)]);
  return values.map((value) => stored.map(([key, text]) => sourceOf(value, key, text)).find(Boolean));
}

async function tokenHeadersOf(tabId, tokenValues = []) {
  if (!tokenValues.length) return [];
  const evaluation = await chrome.debugger.sendCommand({ tabId }, "Runtime.evaluate", { expression: tokenSourcesOf(tokenValues.map(([, value]) => value)), returnByValue: true }).catch(() => undefined);
  const sources = evaluation?.result?.value ?? [];
  return tokenValues.flatMap(([name], index) => {
    const source = sources[index];
    return source ? [{ header: name.toLowerCase(), fromLocalStorage: source.key, ...(source.prefix ? { prefix: source.prefix } : {}), ...(source.path ? { path: source.path } : {}) }] : [];
  });
}

function withoutSecrets(href) {
  const url = new URL(href);
  url.hash = "";
  url.pathname = url.pathname.split("/").map((segment) => isSecretSegment(segment) ? "redacted" : segment).join("/");
  for (const [name, value] of [...url.searchParams]) if (hasWord(wordsOf(name), secretParameterWords) || isSessionSecretName(name) || exactSecretParameters.has(name.toLowerCase()) || looksSecret(value)) url.searchParams.set(name, "redacted");
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
  return url.pathname.split("/").map((segment) => /^\d+$|^[0-9a-f-]{32,36}$/i.test(segment) || isSecretSegment(segment) ? "{id}" : segment).join("/");
}

function graphqlOperationOf(text) {
  if (typeof text !== "string" || !graphqlDocument.test(text)) return undefined;
  return /^\s*(?:query|mutation|subscription)\s+(\w+)/.exec(text)?.[1] ?? text;
}

function operationOf({ url, body }) {
  const parameters = new URL(url).searchParams;
  const fromUrl = parameters.get("operationName") ?? parameters.get("queryId") ?? graphqlOperationOf(parameters.get("query") ?? undefined);
  if (fromUrl) return fromUrl;
  try {
    return [JSON.parse(body)].flat().map((operation) => operation?.operationName ?? graphqlOperationOf(operation?.query) ?? operation?.extensions?.persistedQuery?.sha256Hash ?? "").join(",");
  } catch {
    return "";
  }
}

function digestOf(text) {
  if (!text) return undefined;
  return [0x811c9dc5, 0x01000193].map((seed) => {
    let hash = seed;
    for (const character of text) hash = Math.imul(hash ^ character.codePointAt(0), 16777619) >>> 0;
    return hash.toString(16).padStart(8, "0");
  }).join("");
}

function rememberRequest({ requestId, request }) {
  pendingRequests.delete(requestId);
  const url = new URL(request.url);
  if (!url.protocol.startsWith("http") || analyticsHost.test(url.hostname) || authenticationHost.test(url.hostname) || isAuthenticationPath(url.pathname)) return;
  const pattern = url.origin + pathPattern(url);
  if (pattern.length > maximumUrlLength) return;
  const tokenValues = Object.entries(request.headers ?? {}).filter(([name, value]) => tokenHeaderName.test(name) && value);
  const requestHeaders = replayedHeaders(request.headers);
  const captured = { method: request.method, url: withoutSecrets(request.url), rawUrl: request.url, pattern, ...(tokenValues.length ? { tokenValues } : {}), ...(Object.keys(requestHeaders).length ? { requestHeaders } : {}) };
  if (request.method === "GET") return pendingRequests.set(requestId, captured);
  const requestContentType = contentTypeOf(request.headers);
  pendingRequests.set(requestId, { ...captured, ...(requestContentType ? { requestContentType } : {}), postData: request.postData, hasPostData: request.hasPostData });
}

async function requestBody(tabId, requestId, { postData, hasPostData }) {
  if (postData !== undefined) return postData;
  if (!hasPostData) return undefined;
  const result = await chrome.debugger.sendCommand({ tabId }, "Network.getRequestPostData", { requestId }).catch(() => undefined);
  return result?.postData;
}

function rememberResponse({ requestId, type, response }) {
  const request = pendingRequests.get(requestId);
  if (!request) return;
  if (!dataResourceTypes.includes(type) && !dataContentType.test(response.mimeType)) return pendingRequests.delete(requestId);
  request.status = response.status;
  request.contentType = response.mimeType ?? "";
  request.data = true;
}

const explorationKey = (appId) => `explorations:${appId}`;

async function readRequests(appId) {
  const key = explorationKey(appId);
  const { [key]: exploration, explorations: legacy } = await chrome.storage.local.get([key, "explorations"]);
  return exploration?.requests ?? legacy?.[appId] ?? [];
}

async function tidyStorage() {
  const now = Date.now();
  const { tidiedAt = 0 } = await chrome.storage.local.get("tidiedAt");
  if (now - tidiedAt < tidyIntervalMilliseconds) return;
  await chrome.storage.local.set({ tidiedAt: now });
  const stored = await chrome.storage.local.get(null);
  const legacy = stored.explorations;
  for (const appId of Object.keys(legacy ?? {})) {
    await chrome.storage.local.set({ [explorationKey(appId)]: { recordedAt: now, requests: legacy[appId] } });
    delete legacy[appId];
    await chrome.storage.local.set({ explorations: legacy });
  }
  if (legacy) await chrome.storage.local.remove("explorations");
  const { active } = await chrome.storage.session.get("active");
  const expired = Object.entries(stored).filter(([key, value]) => key.startsWith("explorations:") && key !== explorationKey(active?.appId) && !(now - (value?.recordedAt ?? 0) < retentionDays * 86400000)).map(([key]) => key);
  if (expired.length) await chrome.storage.local.remove(expired);
}

function save(tabId, captured) {
  return update(async () => {
    const { active } = await chrome.storage.session.get("active");
    if (active?.tabId !== tabId) return;
    const requests = await readRequests(active.appId);
    if (requests.length >= maximumRequests || requests.some((request) => request.method === captured.method && request.pattern === captured.pattern && request.operation === captured.operation)) return;
    await chrome.storage.local.set({ [explorationKey(active.appId)]: { recordedAt: Date.now(), requests: [...requests, captured] } });
  }).catch((error) => chrome.storage.session.set({ saveError: `Could not save a recorded request: ${error.message}` }));
}

async function recordRequest(tabId, requestId) {
  const request = pendingRequests.get(requestId);
  pendingRequests.delete(requestId);
  if (!request?.data) return;
  const { postData, hasPostData, tokenValues, data, rawUrl, ...captured } = request;
  const sentBody = await requestBody(tabId, requestId, { postData, hasPostData });
  const operation = digestOf(operationOf({ url: rawUrl, body: sentBody }));
  const body = await chrome.debugger.sendCommand({ tabId }, "Network.getResponseBody", { requestId }).catch(() => undefined);
  const tokenHeaders = await tokenHeadersOf(tabId, tokenValues);
  await save(tabId, { ...captured, ...(operation ? { operation } : {}), ...(tokenHeaders.length ? { tokenHeaders } : {}), ...(sentBody ? { body: bodyOf(sentBody) } : {}), sample: body && !body.base64Encoded ? sampleOf(body.body) : "" });
}

async function recordPage(tabId) {
  const evaluation = await chrome.debugger.sendCommand({ tabId }, "Runtime.evaluate", { expression: pageSnapshot, returnByValue: true }).catch(() => undefined);
  const page = evaluation?.result?.value;
  if (page?.contentType !== "text/html") return;
  const url = new URL(page.url);
  const pattern = url.origin + pathPattern(url);
  if (!url.protocol.startsWith("http") || authenticationHost.test(url.hostname) || isAuthenticationPath(url.pathname) || pattern.length > maximumUrlLength) return;
  const sample = redactText(page.text.replace(/\s+/g, " ").trim().slice(0, maximumSampleLength * 2)).slice(0, maximumSampleLength);
  await save(tabId, { kind: "page", method: "GET", url: withoutSecrets(page.url), pattern, status: page.status, contentType: page.contentType, sample });
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

function isWebsiteUrl(text) {
  try {
    return ["http:", "https:"].includes(new URL(text).protocol);
  } catch {
    return false;
  }
}

async function startRecording(appId, websiteUrl) {
  const { active } = await chrome.storage.session.get("active");
  if (active) throw new Error("Stop your current exploration before opening another.");
  if (!isWebsiteUrl(websiteUrl)) throw new Error("The app needs a website address that starts with http or https.");
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
  try {
    await chrome.tabs.update(tab.id, { url: websiteUrl });
  } catch (error) {
    await chrome.debugger.detach({ tabId: tab.id }).catch(() => {});
    await chrome.tabs.remove(tab.id).catch(() => {});
    await chrome.storage.session.remove("active");
    throw error;
  }
}

async function stopRecording(tabId) {
  await chrome.debugger.detach({ tabId }).catch(() => {});
  await chrome.storage.session.remove("active");
  pendingRequests.clear();
}

async function operate({ action, appId, websiteUrl }) {
  await tidyStorage().catch(() => {});
  if (action === "start") await startRecording(appId, websiteUrl);
  if (action === "status" || action === "start") return status(appId);
  const { active } = await chrome.storage.session.get("active");
  if (active && (action === "stop" || active.appId === appId)) await stopRecording(active.tabId);
  if (action === "clear") {
    await chrome.storage.local.remove(explorationKey(appId));
    const { explorations: legacy } = await chrome.storage.local.get("explorations");
    if (legacy?.[appId]) {
      delete legacy[appId];
      await chrome.storage.local.set({ explorations: legacy });
    }
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
