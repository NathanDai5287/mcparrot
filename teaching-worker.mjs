import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { setTimeout } from "node:timers/promises";

const origin = "http://127.0.0.1:4323";
let schoolOrigin = process.env.MCPARROT_WEBSITE_ORIGIN;
try {
  const session = JSON.parse(await readFile("session.json", "utf8"));
  if (session.websiteOrigin) schoolOrigin = session.websiteOrigin;
} catch {}
if (!schoolOrigin) throw new Error("Set MCPARROT_WEBSITE_ORIGIN or create session.json with websiteOrigin.");
const profile = process.env.MCPARROT_BROWSER_PROFILE ?? resolve(".local/headless-profile");
const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
let commandId = 0;
const pending = new Map();
const recordings = new Map();
let recording = false;
let teachingSocket;
let page;
let browserEndpoint;
let sessionCookie;
let savedTask;
const mcpToken = randomBytes(32).toString("hex");
const pairingTokens = new Map();
const dashboardOrigins = new Set(["https://mcparrot.vercel.app", "http://localhost:4317", "http://127.0.0.1:4317", "http://127.0.0.1:4318", "http://127.0.0.1:4319"]);

async function connect(endpoint) {
  const socket = new WebSocket(endpoint);
  await new Promise((resolveOpen, reject) => {
    socket.addEventListener("open", resolveOpen, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(data);
    const waiting = pending.get(message.id);
    if (waiting) {
      pending.delete(message.id);
      if (message.error) waiting.reject(new Error("The browser command failed."));
      else waiting.resolve(message.result);
    }
    if (socket === teachingSocket) capture(message);
  });
  return socket;
}

function command(socket, method, params = {}) {
  const id = ++commandId;
  return new Promise((resolveResult, reject) => {
    pending.set(id, { resolve: resolveResult, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

function capture(message) {
  if (!recording || message.method !== "Network.requestWillBeSent") return;
  const { request, type } = message.params;
  if (request.method !== "GET" || !["XHR", "Fetch", "Document"].includes(type)) return;
  const url = new URL(request.url);
  const syllabus = /^\/courses\/\d+\/assignments\/syllabus$/.test(url.pathname);
  const api = ["XHR", "Fetch"].includes(type) && /^\/api\/v1\/courses\/\d+(?:\/(?:assignments|assignment_groups|modules|pages|folders|files|front_page|tabs|discussion_topics|quizzes)(?:\/[^/]+)*)?$/.test(url.pathname);
  if (url.origin !== schoolOrigin || (!api && !syllabus)) return;
  if ([...url.searchParams.keys()].some((key) => /token|secret|auth|password|code/i.test(key))) return;
  const key = url.pathname + url.search;
  if (recordings.has(key)) return;
  recordings.set(key, { id: randomBytes(12).toString("hex"), url: url.href, kind: syllabus ? "syllabus" : "json", label: url.pathname.replace(/\/\d+(?=\/|$)/g, "/:id") });
}

async function oldBrowserEndpoint() {
  const portFile = await readFile(resolve(profile, "DevToolsActivePort"), "utf8");
  return `http://127.0.0.1:${Number(portFile.split("\n")[0])}`;
}

async function attachTeachingBrowser() {
  browserEndpoint = await oldBrowserEndpoint();
  const pages = await fetch(`${browserEndpoint}/json/list`).then((result) => result.json());
  page = pages.find((target) => target.type === "page" && target.url.startsWith(schoolOrigin));
  if (!page) return false;
  teachingSocket = await connect(page.webSocketDebuggerUrl);
  await command(teachingSocket, "Network.enable");
  await browserUseCheck();
  return true;
}

async function startTeachingBrowser() {
  await mkdir(profile, { recursive: true });
  try {
    if (await attachTeachingBrowser()) return;
  } catch {
    browserEndpoint = undefined;
  }
  const browser = spawn(chrome, [
    `--user-data-dir=${profile}`, "--remote-debugging-port=0", "--remote-debugging-address=127.0.0.1",
    "--no-first-run", "--no-default-browser-check", "--new-window", `${schoolOrigin}/`,
  ], { detached: true, stdio: "ignore" });
  browser.unref();
  for (let attempt = 0; attempt < 50; attempt += 1) {
    await setTimeout(200);
    try {
      if (await attachTeachingBrowser()) return;
    } catch {
      continue;
    }
  }
  throw new Error("The teaching browser did not open. Check local Chrome and Browser Use.");
}

async function browserUseCheck() {
  await new Promise((resolveResult, reject) => {
    const child = spawn(resolve(homedir(), ".local/bin/browser-use"), [], {
      env: { ...process.env, BU_CDP_URL: browserEndpoint, BU_NAME: "mcparrot-teaching", BH_RECORD: "0", BH_TAB_MARKER: "0", BH_TELEMETRY: "0", ANONYMIZED_TELEMETRY: "false", DO_NOT_TRACK: "1" },
      stdio: ["pipe", "ignore", "ignore"],
    });
    child.on("error", reject);
    child.on("close", (status) => status === 0 ? resolveResult() : reject(new Error("Browser Use could not attach.")));
    child.stdin.end('version = cdp("Browser.getVersion")\nprint("Teaching browser connected." if version else "Unavailable")\n');
  });
}

function state() {
  return { recording, capturedRequests: recordings.size, ready: Boolean(teachingSocket), saved: Boolean(savedTask), courseId: savedTask?.courseId ?? "", kind: savedTask?.kind ?? "", candidates: [...recordings.values()].map(({ id, label, kind }) => ({ id, label, kind })) };
}

function respond(response, status, value) {
  response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  response.end(JSON.stringify(value));
}

async function readPayload(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 8192) throw new Error("The request is too large.");
  }
  return JSON.parse(body);
}

async function saveTask(requestId) {
  recording = false;
  const candidate = [...recordings.values()].find(({ id }) => id === requestId);
  if (!candidate) throw new Error("Select one captured request to test.");
  const { cookies } = await command(teachingSocket, "Network.getCookies", { urls: [candidate.url] });
  sessionCookie = cookies.map(({ name, value }) => `${name}=${value}`).join("; ");
  savedTask = { ...candidate, courseId: new URL(candidate.url).pathname.match(/\/courses\/(\d+)/)?.[1] ?? "" };
  return { ...state(), courseId: savedTask.courseId };
}

async function replay(courseId) {
  if (!savedTask || !sessionCookie) throw new Error("Record and save one task first.");
  if (savedTask.courseId && !/^\d+$/.test(courseId)) throw new Error("Enter the numeric course ID.");
  const url = new URL(savedTask.url);
  url.pathname = url.pathname.replace(/(\/courses\/)\d+/, `$1${courseId}`);
  const result = await fetch(url, { headers: { Cookie: sessionCookie, Accept: "application/json" }, redirect: "manual" });
  if (!result.ok) throw new Error("The school request needs sign-in or is not supported.");
  if (savedTask.kind === "syllabus") {
    const html = await result.text();
    if (!html.includes('id="course_syllabus"')) throw new Error("The response did not contain a syllabus page.");
    return { syllabusPageReceived: true };
  }
  if (!result.headers.get("content-type")?.includes("application/json")) throw new Error("The response was not assignment data.");
  const entries = await result.json();
  return { resultCount: Array.isArray(entries) ? entries.length : null };
}

function authenticated(request) {
  const supplied = Buffer.from(request.headers.authorization ?? "");
  const tokens = request.headers.origin ? [...pairingTokens].filter(([, expiry]) => expiry > Date.now()).map(([token]) => token) : [mcpToken];
  return tokens.some((token) => {
    const expected = Buffer.from(`Bearer ${token}`);
    return supplied.length === expected.length && timingSafeEqual(supplied, expected);
  });
}

async function mcp(request, response) {
  if (!authenticated(request)) return respond(response, 401, { error: "Authorize this local MCP connection." });
  const message = await readPayload(request);
  if (message.id === undefined) { response.writeHead(202); return response.end(); }
  const result = await mcpResult(message);
  return respond(response, 200, { jsonrpc: "2.0", id: message.id, ...result });
}

const operationNames = ["get_teaching_status", "start_recording", "stop_recording", "review_recording", "test_saved_request", "test_mcp_tool", "focus_teaching_browser"];

async function operate(name, input = {}) {
  if (name === "get_teaching_status") return state();
  if (name === "start_recording") { recordings.clear(); savedTask = undefined; sessionCookie = undefined; recording = true; return state(); }
  if (name === "stop_recording") { recording = false; return state(); }
  if (name === "review_recording") return saveTask(input.requestId);
  if (name === "focus_teaching_browser") { await command(teachingSocket, "Page.bringToFront"); return state(); }
  if (name === "test_saved_request") return { ...state(), success: true, ...await replay(input.courseId) };
  if (name === "test_mcp_tool") {
    const result = await fetch(`${origin}/mcp`, {
      method: "POST",
      headers: { Authorization: `Bearer ${mcpToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "run_saved_reading", arguments: input } }),
    }).then((response) => response.json());
    if (result.result.isError) throw new Error("The local MCP test failed. Check sign-in and the course ID.");
    return { ...state(), success: true };
  }
  if (name === "run_saved_reading") return replay(input.courseId);
  throw new Error("Unknown teaching operation.");
}

async function mcpResult(message) {
  if (message.method === "initialize") return { result: { protocolVersion: "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: "mcparrot-local-teaching", version: "0.1.0" } } };
  if (message.method === "ping") return { result: {} };
  if (message.method === "tools/list") return { result: { tools: [...operationNames, ...(savedTask ? ["run_saved_reading"] : [])].map((name) => ({ name, description: name.replaceAll("_", " "), inputSchema: { type: "object", properties: { courseId: { type: "string", pattern: "^[0-9]+$" }, requestId: { type: "string" } }, additionalProperties: false } })) } };
  if (message.method !== "tools/call") return { error: { code: -32601, message: "Unknown MCP method." } };
  try {
    const result = await operate(message.params.name, message.params.arguments);
    return { result: { content: [{ type: "text", text: JSON.stringify(result) }], isError: false } };
  } catch {
    return { result: { content: [{ type: "text", text: "The teaching operation failed. Check the recording and sign-in." }], isError: true } };
  }
}

async function handle(request, response) {
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Content-Type-Options", "nosniff");
  if (request.headers.host !== "127.0.0.1:4323") return respond(response, 403, { error: "Use the local proof address." });
  if (request.url?.startsWith("/pair?") && request.method === "GET") {
    const dashboardOrigin = new URL(request.url, origin).searchParams.get("origin");
    if (!dashboardOrigins.has(dashboardOrigin)) return respond(response, 403, { error: "This dashboard is not authorized." });
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Content-Security-Policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'" });
    const token = randomBytes(32).toString("hex");
    pairingTokens.set(token, Date.now() + 3600000);
    const html = await readFile(new URL("teaching-worker.html", import.meta.url), "utf8");
    return response.end(html.replace("__DASHBOARD_ORIGIN__", JSON.stringify(dashboardOrigin)).replace("__LOCAL_TOKEN__", JSON.stringify(token)));
  }
  if (request.url === "/mcp" && request.method === "POST" && !request.headers.origin) return mcp(request, response);
  if (request.url !== "/operation" || request.method !== "POST" || request.headers.origin !== origin || !authenticated(request)) return respond(response, 403, { error: "Use the paired teaching controls." });
  const input = await readPayload(request);
  return respond(response, 200, await operate(input.name, input.arguments));
}

await startTeachingBrowser();
createServer((request, response) => {
  handle(request, response).catch(() => respond(response, 500, { error: "The proof action failed." }));
}).listen(4323, "127.0.0.1", () => console.log(`MCParrot local teaching worker: ${origin}`));
