import { APIError, Sandbox } from "@vercel/sandbox";
import { createCipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const browserApi = "https://api.browser-use.com/api/v4/browsers";
const sessionDuration = 30 * 60 * 1000;
export const teachingOperations = ["create_teaching_session", "get_teaching_status", "start_recording", "resume_recording", "stop_recording", "test_saved_request", "end_teaching_session", "continue_signin", "submit_signin_code"] as const;
export type TeachingOperation = typeof teachingOperations[number];
type Session = { sandboxName: string; browserId: string; appId: string; taskId: string; expiresAt: number };
type TeachingResult = { session?: Session; state: Record<string, unknown> };
type Browser = { id: string; liveUrl: string; cdpUrl: string };

function signingSecret() {
  const secret = process.env.MCPARROT_SESSION_SECRET;
  if (!secret) throw new Error("Hosted teaching is not configured.");
  return secret;
}

export function signSession(session: Session) {
  const body = Buffer.from(JSON.stringify(session)).toString("base64url");
  return `${body}.${createHmac("sha256", signingSecret()).update(body).digest("base64url")}`;
}

export function readSession(token: string | undefined, appId: string, taskId: string): Session | undefined {
  if (!token) return;
  const [body, signature = ""] = token.split(".");
  const expected = createHmac("sha256", signingSecret()).update(body).digest();
  const actual = Buffer.from(signature, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return;
  const session: Session = JSON.parse(Buffer.from(body, "base64url").toString());
  if (session.appId !== appId || session.taskId !== taskId || session.expiresAt < Date.now()) return;
  return session;
}

async function browserRequest(path: string, method = "GET", body?: object) {
  const key = process.env.BROWSER_USE_API_KEY;
  if (!key || process.env.VERCEL_ENV !== "production") throw new Error("Hosted teaching is available on the production site only.");
  const response = await fetch(`${browserApi}${path}`, {
    method, headers: { "X-Browser-Use-API-Key": key, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined, cache: "no-store", signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`Browser Use could not complete this action (${response.status}).`);
  return response.json();
}

async function recorderOperation(sandbox: Sandbox, name: string, input: object = {}) {
  const command = await sandbox.runCommand({ cmd: "curl", args: ["--silent", "--show-error", "--max-time", "25", "-X", "POST", "-H", "Content-Type: application/json", "--data", JSON.stringify({ name, arguments: input }), "http://127.0.0.1:4323"] });
  if (command.exitCode !== 0) throw new Error("The hosted recorder is unavailable. End this session and reconnect.");
  const result = JSON.parse(await command.stdout());
  if (result.error) throw new Error(result.error);
  return result;
}

function authenticationKey(sandbox: Sandbox) {
  return createHmac("sha256", signingSecret()).update(`authentication:${sandbox.name}`).digest();
}

function encryptedAuthentication(sandbox: Sandbox, payload: object) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", authenticationKey(sandbox), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(payload)), cipher.final()]);
  return { iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: data.toString("base64") };
}

async function authenticationOperation(sandbox: Sandbox, name: string, payload: object) {
  const lock = await sandbox.runCommand({ cmd: "mkdir", args: ["auth-start.lock"] });
  if (lock.exitCode === 0) {
    await sandbox.writeFiles([
      { path: "cloud-auth.mjs", content: await readFile(join(process.cwd(), "cloud-auth.mjs")) },
      { path: "auth-control.json", content: Buffer.from(JSON.stringify({ key: authenticationKey(sandbox).toString("hex") })) },
    ]);
    await sandbox.runCommand({ cmd: "node", args: ["cloud-auth.mjs"], detached: true });
  }
  const envelope = encryptedAuthentication(sandbox, payload);
  const command = await sandbox.runCommand({ cmd: "curl", args: ["--silent", "--show-error", "--retry", "8", "--retry-connrefused", "--retry-delay", "1", "--max-time", "35", "-X", "POST", "-H", "Content-Type: application/json", "--data", JSON.stringify({ name, envelope }), "http://127.0.0.1:4324"] });
  if (command.exitCode !== 0) throw new Error("The cloud sign-in helper is unavailable. Continue manually in the teaching browser window.");
  return JSON.parse(await command.stdout());
}

async function authenticationStatus(sandbox: Sandbox) {
  const control = await sandbox.readFileToBuffer({ path: "auth-control.json" });
  if (!control) return undefined;
  const command = await sandbox.runCommand({ cmd: "curl", args: ["--silent", "--max-time", "5", "-X", "POST", "-H", "Content-Type: application/json", "--data", '{"name":"get_authentication_status"}', "http://127.0.0.1:4324"] });
  if (command.exitCode !== 0) return { stage: "manual_required", message: "Automatic sign-in is unavailable. Continue in the teaching browser window." };
  return JSON.parse(await command.stdout());
}

async function teachingSandbox(name: string) {
  try {
    return { sandbox: await Sandbox.create({ name, runtime: "node22", timeout: sessionDuration, resources: { vcpus: 1 }, persistent: false }), created: true };
  } catch (error) {
    if (!(error instanceof APIError) || error.response.status !== 409) throw new Error("Vercel could not open the hosted recorder. Check Sandbox access.");
    return { sandbox: await Sandbox.get({ name }), created: false };
  }
}

async function createSession(appId: string, taskId: string, websiteOrigin: string): Promise<TeachingResult> {
  const name = `teaching-${createHmac("sha256", signingSecret()).update(`${appId}:${taskId}`).digest("hex").slice(0, 24)}`;
  const { sandbox, created } = await teachingSandbox(name);
  if (!created) {
    if (sandbox.status !== "running") {
      await sandbox.delete();
      throw new Error("The previous session ended. Connect the teaching browser again.");
    }
    const ownerFile = await sandbox.readFileToBuffer({ path: "owner.json" });
    if (!ownerFile) throw new Error("The teaching browser is opening. Wait a moment, then connect again.");
    const session: Session = JSON.parse(ownerFile.toString());
    if (session.expiresAt < Date.now()) {
      await sandbox.delete();
      throw new Error("The previous session expired. Connect the teaching browser again.");
    }
    return operateTeaching("get_teaching_status", session, appId, taskId);
  }
  let browser: Browser | undefined;
  try {
    browser = await browserRequest("", "POST", { timeout: 30, enableRecording: false, browserScreenWidth: 1440, browserScreenHeight: 1000 }) as Browser;
    await sandbox.writeFiles([
      { path: "cloud-recorder.mjs", content: await readFile(join(process.cwd(), "cloud-recorder.mjs")) },
      { path: "session.json", content: Buffer.from(JSON.stringify({ cdpUrl: browser.cdpUrl, websiteOrigin })) },
    ]);
    await sandbox.runCommand({ cmd: "node", args: ["cloud-recorder.mjs"], detached: true });
    const ready = await sandbox.runCommand({ cmd: "curl", args: ["--silent", "--show-error", "--retry", "10", "--retry-connrefused", "--retry-delay", "1", "--max-time", "20", "-X", "POST", "-H", "Content-Type: application/json", "--data", '{"name":"get_teaching_status"}', "http://127.0.0.1:4323"] });
    if (ready.exitCode !== 0) throw new Error("The hosted recorder did not start. Try connecting again.");
    const session: Session = { sandboxName: sandbox.name, browserId: browser.id, appId, taskId, expiresAt: Date.now() + sessionDuration };
    await sandbox.writeFiles([{ path: "owner.json", content: Buffer.from(JSON.stringify(session)) }]);
    return { session, state: { ...JSON.parse(await ready.stdout()), liveUrl: browser.liveUrl, expiresAt: session.expiresAt } };
  } catch (error) {
    if (browser) await browserRequest(`/${browser.id}`, "PATCH", { action: "stop" }).catch(() => {});
    await sandbox.delete().catch(() => {});
    throw error;
  }
}

export function websiteOriginFromUrl(websiteUrl: unknown) {
  if (typeof websiteUrl !== "string") return;
  try {
    const url = new URL(websiteUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") return;
    return url.origin;
  } catch {
    return;
  }
}

export async function operateTeaching(name: TeachingOperation, session: Session | undefined, appId: string, taskId: string, input: object = {}, websiteOrigin?: string): Promise<TeachingResult> {
  if (!session && name === "get_teaching_status") return { session: undefined, state: { ready: false, recording: false, candidates: [] } };
  if (!session && name === "create_teaching_session") {
    if (!websiteOrigin) throw new Error("Enter a valid website address for this app.");
    return createSession(appId, taskId, websiteOrigin);
  }
  if (!session) throw new Error("Connect the teaching browser first.");
  if (name === "end_teaching_session") {
    try {
      await browserRequest(`/${session.browserId}`, "PATCH", { action: "stop" });
    } finally {
      await Sandbox.get({ name: session.sandboxName }).then((sandbox) => sandbox.delete()).catch(() => {});
    }
    return { session: undefined, state: { ready: false, recording: false, candidates: [], ended: true } };
  }
  const sandbox = await Sandbox.get({ name: session.sandboxName });
  const authenticationAction = name === "continue_signin" || name === "submit_signin_code";
  let authentication;
  if (authenticationAction) {
    await recorderOperation(sandbox, "stop_recording");
    const code = (input as { code?: string }).code;
    if (name === "submit_signin_code" && (typeof code !== "string" || !/^\d{6,10}$/.test(code))) throw new Error("Enter the numeric text code from your phone.");
    const payload = name === "continue_signin" ? { username: process.env.CANVAS_USERNAME, password: process.env.CANVAS_PASSWORD } : { code };
    authentication = await authenticationOperation(sandbox, name, payload);
  }
  const operation = name === "create_teaching_session" || authenticationAction ? "get_teaching_status" : name;
  const state = await recorderOperation(sandbox, operation, authenticationAction ? {} : input);
  authentication ??= await authenticationStatus(sandbox);
  const browser = await browserRequest(`/${session.browserId}`) as Browser;
  return { session, state: { ...state, authentication, liveUrl: browser.liveUrl, expiresAt: session.expiresAt } };
}
