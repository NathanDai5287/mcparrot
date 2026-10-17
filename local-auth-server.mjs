import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { runBrowserCode } from "./browser-local.mjs";

const port = 4321;
const host = "127.0.0.1";
const origin = `http://${host}:${port}`;
const maximumBodyBytes = 4096;
const actionCode = await readFile(new URL("./local-auth-actions.py", import.meta.url), "utf8");
const page = await readFile(new URL("./local-auth.html", import.meta.url));
let busy = false;
let verificationStep = "start";

async function readPayload(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > maximumBodyBytes) throw new Error("Request too large.");
  }
  return JSON.parse(body);
}

async function browserAction(action, payload = {}) {
  if (busy) return {stage: "working", message: "The previous browser action is still running."};
  busy = true;
  try {
    if (action === "login") verificationStep = "start";
    const result = JSON.parse(await runBrowserCode(actionCode, {...payload, action, step: verificationStep}));
    if (result.nextStep) verificationStep = result.nextStep;
    return result;
  } finally {
    busy = false;
    for (const key of Object.keys(payload)) delete payload[key];
  }
}

function respond(response, status, value) {
  response.writeHead(status, {"Content-Type": "application/json", "Cache-Control": "no-store"});
  response.end(JSON.stringify(value));
}

async function handleRequest(request, response) {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  if (request.headers.host !== `${host}:${port}`) return respond(response, 403, {message: "Use the local test address."});
  if (request.method === "GET" && request.url === "/") {
    response.writeHead(200, {"Content-Type": "text/html; charset=utf-8"});
    return response.end(page);
  }
  if (request.method === "GET" && request.url === "/api/state") {
    const site = request.headers["sec-fetch-site"];
    if (site && site !== "same-origin") return respond(response, 403, {message: "Open the local sign-in page to check status."});
    return respond(response, 200, await browserAction("state"));
  }
  if (request.method !== "POST" || request.headers.origin !== origin) return respond(response, 403, {message: "This request is not allowed."});
  if (!["/api/login", "/api/code"].includes(request.url)) return respond(response, 404, {message: "Unknown test action."});
  const payload = await readPayload(request);
  if (request.url === "/api/code") {
    if (typeof payload.code !== "string" || !/^\d{6,10}$/.test(payload.code)) return respond(response, 400, {message: "Enter the code from your phone."});
    return respond(response, 200, await browserAction("code", payload));
  }
  if (typeof payload.username !== "string" || typeof payload.password !== "string") return respond(response, 400, {message: "Enter your username and password."});
  return respond(response, 200, await browserAction("login", payload));
}

await runBrowserCode([
  "activate_tab(current_tab())",
  'cdp("Emulation.setFocusEmulationEnabled", enabled=True)',
  'cdp("Emulation.setDeviceMetricsOverride", width=1280, height=900, deviceScaleFactor=1, mobile=False)',
  'if js("location.href") == "about:blank":',
  '    cdp("Page.navigate", url="https://bcourses.berkeley.edu/login/cas", _response_timeout=30)',
].join("\n"));

const server = createServer((request, response) => {
  handleRequest(request, response).catch(() => respond(response, 500, {
    stage: "error", message: "The browser step failed. Check the current status before trying again.",
  }));
});
server.listen(port, host, () => console.log(`Local sign-in test: ${origin}`));
