import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

const configuration = JSON.parse(await readFile("session.json", "utf8"));
const candidates = new Map();
const pending = new Map();
const attachedTargets = new Set();
let commandId = 0;
let recording = false;
let connected = false;
let lastTest;
const socket = new WebSocket(configuration.cdpUrl);

function command(method, params = {}, sessionId) {
  const id = ++commandId;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error("The browser did not respond."));
    }, 15000);
    pending.set(id, { resolve, reject, timeout });
    socket.send(JSON.stringify({ id, method, params, sessionId }));
  });
}

function candidateFromRequest({ request, type }) {
  if (request.method !== "GET" || !["XHR", "Fetch", "Document"].includes(type)) return;
  const url = new URL(request.url);
  if (url.origin !== configuration.websiteOrigin) return;
  const syllabus = /^\/courses\/\d+\/assignments\/syllabus$/.test(url.pathname);
  const api = ["XHR", "Fetch"].includes(type) && /^\/api\/v1\/courses\/\d+(?:\/(?:assignments|assignment_groups|modules|pages|folders|files|front_page|tabs|discussion_topics|quizzes)(?:\/[^/]+)*)?$/.test(url.pathname);
  if (!api && !syllabus) return;
  if ([...url.searchParams.keys()].some((key) => /token|secret|auth|password|code/i.test(key))) return;
  const label = syllabus ? "Read syllabus" : `Read ${url.pathname.split("/")[5]?.replaceAll("_", " ") ?? "course information"}`;
  const courseId = url.pathname.match(/\/courses\/(\d+)/)?.[1];
  return { id: randomUUID(), url: url.href, label, kind: syllabus ? "syllabus" : "json", courseId };
}

function capture(message) {
  if (!recording || message.method !== "Network.requestWillBeSent" || candidates.size >= 100) return;
  const candidate = candidateFromRequest(message.params);
  if (candidate && !candidates.has(candidate.url)) candidates.set(candidate.url, candidate);
}

async function attach(targetInfo) {
  if (targetInfo.type !== "page" || attachedTargets.has(targetInfo.targetId)) return;
  attachedTargets.add(targetInfo.targetId);
  const { sessionId } = await command("Target.attachToTarget", { targetId: targetInfo.targetId, flatten: true });
  await command("Network.enable", {}, sessionId);
  return sessionId;
}

socket.addEventListener("message", ({ data }) => {
  const message = JSON.parse(data);
  const waiting = pending.get(message.id);
  if (waiting) {
    clearTimeout(waiting.timeout);
    pending.delete(message.id);
    if (message.error) waiting.reject(new Error("The browser command failed."));
    else waiting.resolve(message.result);
    return;
  }
  if (message.method === "Target.targetCreated") attach(message.params.targetInfo).catch(() => { connected = false; });
  capture(message);
});
socket.addEventListener("close", () => { connected = false; recording = false; });
socket.addEventListener("error", () => { connected = false; recording = false; });

function status() {
  return {
    ready: connected, recording, capturedRequests: candidates.size, lastTest,
    candidates: [...candidates.values()].map(({ id, label, kind, courseId }) => ({ id, label, kind, courseId })),
  };
}

function applicableCookie(cookie, url) {
  const domain = cookie.domain.replace(/^\./, "");
  const domainMatches = url.hostname === domain || (cookie.domain.startsWith(".") && url.hostname.endsWith(`.${domain}`));
  const pathMatches = url.pathname === cookie.path || url.pathname.startsWith(cookie.path.endsWith("/") ? cookie.path : `${cookie.path}/`);
  return domainMatches && pathMatches && (!cookie.secure || url.protocol === "https:");
}

async function boundedResponse(response) {
  let text = "";
  for await (const chunk of response.body) {
    text += new TextDecoder().decode(chunk);
    if (text.length > 2000000) {
      
      throw new Error("This response is too large for the reading test.");
    }
  }
  return text;
}

async function testRequest({ requestId, courseId }) {
  if (recording) throw new Error("Stop recording before testing a request.");
  const candidate = [...candidates.values()].find(({ id }) => id === requestId);
  if (!candidate) throw new Error("Choose an observed request.");
  if (!/^\d+$/.test(courseId)) throw new Error("Enter a numeric course ID.");
  const url = new URL(candidate.url);
  url.pathname = url.pathname.replace(/(\/courses\/)\d+/, `$1${courseId}`);
  const { cookies } = await command("Storage.getCookies");
  const cookie = cookies.filter((entry) => applicableCookie(entry, url)).map(({ name, value }) => `${name}=${value}`).join("; ");
  const response = await fetch(url, { headers: { Cookie: cookie, Accept: candidate.kind === "json" ? "application/json" : "text/html" }, redirect: "manual", signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error("Canvas rejected this request. Check sign-in and the course ID.");
  const text = await boundedResponse(response);
  if (candidate.kind === "syllabus" && !text.includes('id="course_syllabus"')) throw new Error("Canvas did not return a syllabus page.");
  if (candidate.kind === "json" && !response.headers.get("content-type")?.includes("application/json")) throw new Error("Canvas did not return reading data. Check sign-in.");
  const entries = candidate.kind === "json" ? JSON.parse(text) : null;
  lastTest = { requestId, courseId, changedInput: courseId !== candidate.courseId, success: true, resultCount: Array.isArray(entries) ? entries.length : null, testedAt: new Date().toISOString() };
  return status();
}

async function operate(name, input = {}) {
  if (name === "get_teaching_status") return status();
  if (!connected) throw new Error("The browser connection ended. Start a new session.");
  if (name === "start_recording") { candidates.clear(); lastTest = undefined; recording = true; return status(); }
  if (name === "stop_recording") { recording = false; return status(); }
  if (name === "test_saved_request") return testRequest(input);
  throw new Error("Unknown teaching operation.");
}

async function handle(request, response) {
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "no-store");
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 4096) throw new Error("The request is too large.");
  }
  const input = JSON.parse(body);
  try {
    response.end(JSON.stringify(await operate(input.name, input.arguments)));
  } catch (error) {
    response.statusCode = 400;
    response.end(JSON.stringify({ error: error instanceof Error ? error.message : "The teaching action failed." }));
  }
}

async function start() {
  await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});
await command("Target.setDiscoverTargets", { discover: true });
const { targetInfos } = await command("Target.getTargets");
const page = targetInfos.find(({ type }) => type === "page");
const targetId = page?.targetId ?? (await command("Target.createTarget", { url: "about:blank" })).targetId;
const sessionId = await attach({ type: "page", targetId });
const { sessionId: navigationSession } = sessionId ? { sessionId } : await command("Target.attachToTarget", { targetId, flatten: true });
await command("Page.navigate", { url: `${configuration.websiteOrigin}/login/cas` }, navigationSession);
connected = true;
createServer((request, response) => {
  handle(request, response).catch(() => { response.statusCode = 500; response.end(JSON.stringify({ error: "The teaching action failed." })); });
}).listen(4323, "127.0.0.1");

}

start().catch(() => process.exit(1));
