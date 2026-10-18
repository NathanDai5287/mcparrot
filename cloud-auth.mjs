import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createDecipheriv } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

const configuration = JSON.parse(await readFile("session.json", "utf8"));
const control = JSON.parse(await readFile("auth-control.json", "utf8"));
const socket = new WebSocket(configuration.cdpUrl);
const pending = new Map();
let commandId = 0;
let passwordAttempted = false;
let smsRequested = false;
let optionsOpened = false;
let busy = false;
let authentication = { stage: "idle", message: "Select Sign in automatically to continue." };

function command(method, params = {}, sessionId) {
  const id = ++commandId;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error("The school page did not respond.")); }, 12000);
    pending.set(id, { resolve, reject, timeout });
    socket.send(JSON.stringify({ id, method, params, sessionId }));
  });
}

socket.addEventListener("message", ({ data }) => {
  const message = JSON.parse(data);
  const waiting = pending.get(message.id);
  if (!waiting) return;
  clearTimeout(waiting.timeout);
  pending.delete(message.id);
  if (message.error) waiting.reject(new Error("The school page could not complete this step."));
  else waiting.resolve(message.result);
});
socket.addEventListener("error", () => {});

const inspectPage = `(() => {
  const visible = (element) => element && element.getClientRects().length > 0;
  if (location.origin === 'https://bcourses.berkeley.edu' && document.querySelector('#global_nav_profile_link')) return { stage: 'signed_in', message: 'Website sign-in succeeded.' };
  if (location.origin === 'https://auth.berkeley.edu' && location.pathname === '/cas/login') {
    const rejected = [...document.querySelectorAll('#msg,.errors,.alert-danger,[role=alert]')].some(element => visible(element) && /invalid|incorrect|failed|locked|try again/i.test(element.textContent));
    if (rejected) return { stage: 'rejected', message: 'The website rejected the sign-in. Continue manually in the teaching browser window.' };
    if (document.querySelector('#username') && document.querySelector('#password')) return { stage: 'credentials', message: 'The sign-in page is ready.' };
  }
  if (location.protocol !== 'https:' || !location.hostname.endsWith('.duosecurity.com')) return { stage: 'waiting', message: 'Waiting for the school sign-in page.' };
  const rejected = [...document.querySelectorAll('[role=alert],.error-message,.alert-danger')].some(element => visible(element) && /invalid|incorrect|expired|try again/i.test(element.textContent));
  if (visible(document.querySelector('#passcode-input'))) return { stage: 'verification_required', rejected, message: rejected ? 'The code was rejected. Enter a current text code and submit again.' : 'Enter the text code for your phone ending in 2199.' };
  const buttons = [...document.querySelectorAll('button')].filter(visible);
  if (buttons.some(element => element.innerText.trim() === 'No, other people use this device')) return { stage: 'trust', message: 'Skipping optional device trust.' };
  if (buttons.some(element => /Text message passcode/i.test(element.innerText) && element.innerText.includes('2199'))) return { stage: 'sms_option', message: 'The school offers text verification for phone ending in 2199.' };
  if (buttons.some(element => element.innerText.trim() === 'Other options')) return { stage: 'other_options', message: 'Checking the school verification options.' };
  return { stage: 'waiting', message: 'Waiting for supported school verification.' };
})()`;

async function evaluate(sessionId, expression) {
  const result = await command("Runtime.evaluate", { expression, returnByValue: true }, sessionId);
  if (result.exceptionDetails) throw new Error("This sign-in step is unavailable. Continue manually in the teaching browser window.");
  return result.result.value;
}

async function inspectAuthentication() {
  const { targetInfos } = await command("Target.getTargets");
  const pages = targetInfos.filter(({ type, url }) => type === "page" && /^https:\/\/(?:auth\.berkeley\.edu|bcourses\.berkeley\.edu|[a-zA-Z0-9-]+\.duosecurity\.com)(?:\/|$)/.test(url));
  for (const page of pages) {
    const { sessionId } = await command("Target.attachToTarget", { targetId: page.targetId, flatten: true });
    await command("Emulation.setFocusEmulationEnabled", { enabled: true }, sessionId);
    const state = await evaluate(sessionId, inspectPage);
    if (state.stage !== "waiting") return { state, sessionId };
  }
  return { state: { stage: "waiting", message: "Waiting for a supported sign-in page. You can continue manually in the teaching browser window." } };
}

async function submitCredentials(sessionId, credentials) {
  const expression = `(data => {
    if (location.origin !== 'https://auth.berkeley.edu' || location.pathname !== '/cas/login') return false;
    const username = document.querySelector('#username');
    const password = document.querySelector('#password');
    const submit = document.querySelector('#submitBtn');
    const form = password?.form;
    if (!username || !password || !submit || !form || new URL(form.action, location.href).origin !== 'https://auth.berkeley.edu') return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(username, data.username);
    setter.call(password, data.password);
    username.dispatchEvent(new Event('input', { bubbles: true }));
    password.dispatchEvent(new Event('input', { bubbles: true }));
    submit.click();
    return true;
  })(${JSON.stringify(credentials)})`;
  passwordAttempted = true;
  return evaluate(sessionId, expression);
}

async function selectVerification(sessionId, stage) {
  const expression = `(stage => {
    if (location.protocol !== 'https:' || !location.hostname.endsWith('.duosecurity.com')) return false;
    const buttons = [...document.querySelectorAll('button')].filter(element => element.getClientRects().length > 0);
    const target = buttons.find(element => stage === 'sms_option' ? /Text message passcode/i.test(element.innerText) && element.innerText.includes('2199') : element.innerText.trim() === (stage === 'trust' ? 'No, other people use this device' : 'Other options'));
    if (!target || target.disabled) return false;
    target.click();
    return true;
  })(${JSON.stringify(stage)})`;
  if (stage === "sms_option") smsRequested = true;
  if (stage === "other_options") optionsOpened = true;
  return evaluate(sessionId, expression);
}

async function advanceSignIn(credentials) {
  for (let step = 0; step < 10; step += 1) {
    const { state, sessionId } = await inspectAuthentication();
    authentication = state;
    if (["signed_in", "verification_required", "rejected"].includes(state.stage)) return authentication;
    if (state.stage === "credentials") {
      if (passwordAttempted) return { stage: "manual_required", message: "The password was already submitted once. Check the teaching browser window; automatic retries are disabled." };
      if (!credentials.username || !credentials.password) return { stage: "manual_required", message: "Automatic credentials are unavailable. Sign in manually in the teaching browser window." };
      await submitCredentials(sessionId, credentials);
    }
    if (state.stage === "trust") await selectVerification(sessionId, state.stage);
    if (state.stage === "sms_option" && !smsRequested) await selectVerification(sessionId, state.stage);
    if (state.stage === "other_options" && !optionsOpened && !smsRequested) await selectVerification(sessionId, state.stage);
    await delay(650);
  }
  return { stage: "manual_required", message: smsRequested ? "The text option was requested once. Check the teaching browser window, then select Check sign-in." : "The website did not offer a supported text-code step. Continue manually in the teaching browser window, then check sign-in." };
}

async function submitCode(code) {
  if (!/^\d{6,10}$/.test(code)) return { stage: "verification_required", message: "Enter the numeric text code from your phone." };
  const { state, sessionId } = await inspectAuthentication();
  if (state.stage !== "verification_required") return state;
  await evaluate(sessionId, `(code => {
    if (location.protocol !== 'https:' || !location.hostname.endsWith('.duosecurity.com')) return false;
    const field = document.querySelector('#passcode-input');
    const verify = [...document.querySelectorAll('button')].find(element => element.innerText.trim() === 'Verify');
    if (!field || !verify) return false;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(field, code);
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
    if (verify.disabled) return false;
    verify.click();
    return true;
  })(${JSON.stringify(code)})`);
  await delay(1000);
  return advanceSignIn({});
}

function decryptEnvelope(envelope) {
  const decipher = createDecipheriv("aes-256-gcm", Buffer.from(control.key, "hex"), Buffer.from(envelope.iv, "base64"));
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.data, "base64")), decipher.final()]).toString());
}

async function handle(request, response) {
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "no-store");
  let body = "";
  for await (const chunk of request) { body += chunk; if (body.length > 12000) throw new Error("Invalid request."); }
  const input = JSON.parse(body);
  if (input.name === "get_authentication_status") {
    const observed = await inspectAuthentication();
    if (observed.state.stage === "signed_in") authentication = observed.state;
    return response.end(JSON.stringify(authentication));
  }
  if (busy) return response.end(JSON.stringify({ stage: "signing_in", message: "The previous sign-in step is still running." }));
  busy = true;
  let payload;
  try {
    payload = decryptEnvelope(input.envelope);
    if (input.name === "continue_signin") authentication = await advanceSignIn(payload);
    if (input.name === "submit_signin_code") authentication = await submitCode(payload.code);
    response.end(JSON.stringify(authentication));
  } finally {
    if (payload) for (const key of Object.keys(payload)) delete payload[key];
    busy = false;
  }
}

async function start() {
  await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
  createServer((request, response) => { handle(request, response).catch(() => { response.statusCode = 400; response.end(JSON.stringify({ stage: "manual_required", message: "The automatic sign-in step failed. Continue manually in the teaching browser window." })); }); }).listen(4324, "127.0.0.1");
}

start().catch(() => process.exit(1));
