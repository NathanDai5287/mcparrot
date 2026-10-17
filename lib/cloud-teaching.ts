import { APIError, Sandbox } from "@vercel/sandbox";
import { createHmac, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const browserApi = "https://api.browser-use.com/api/v4/browsers";
const sessionDuration = 30 * 60 * 1000;
export const teachingOperations = ["create_teaching_session", "get_teaching_status", "start_recording", "stop_recording", "test_saved_request", "end_teaching_session"] as const;
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

async function teachingSandbox(name: string) {
  try {
    return { sandbox: await Sandbox.create({ name, runtime: "node22", timeout: sessionDuration, resources: { vcpus: 1 }, persistent: false }), created: true };
  } catch (error) {
    if (!(error instanceof APIError) || error.response.status !== 409) throw new Error("Vercel could not open the hosted recorder. Check Sandbox access.");
    return { sandbox: await Sandbox.get({ name }), created: false };
  }
}

async function createSession(appId: string, taskId: string): Promise<TeachingResult> {
  const name = `teaching-${createHmac("sha256", signingSecret()).update(`${appId}:${taskId}`).digest("hex").slice(0, 24)}`;
  const { sandbox, created } = await teachingSandbox(name);
  if (!created) {
    if (sandbox.status !== "running") {
      await sandbox.delete();
      throw new Error("The previous session ended. Select Connect Canvas again.");
    }
    const ownerFile = await sandbox.readFileToBuffer({ path: "owner.json" });
    if (!ownerFile) throw new Error("The teaching browser is opening. Wait a moment, then select Connect Canvas again.");
    const session: Session = JSON.parse(ownerFile.toString());
    if (session.expiresAt < Date.now()) {
      await sandbox.delete();
      throw new Error("The previous session expired. Select Connect Canvas again.");
    }
    return operateTeaching("get_teaching_status", session, appId, taskId);
  }
  let browser: Browser | undefined;
  try {
    browser = await browserRequest("", "POST", { timeout: 30, enableRecording: false, browserScreenWidth: 1440, browserScreenHeight: 1000 }) as Browser;
    await sandbox.writeFiles([
      { path: "cloud-recorder.mjs", content: await readFile(join(process.cwd(), "cloud-recorder.mjs")) },
      { path: "session.json", content: Buffer.from(JSON.stringify({ cdpUrl: browser.cdpUrl, websiteOrigin: "https://bcourses.berkeley.edu" })) },
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

export async function operateTeaching(name: TeachingOperation, session: Session | undefined, appId: string, taskId: string, input: object = {}): Promise<TeachingResult> {
  if (!session && name === "get_teaching_status") return { session: undefined, state: { ready: false, recording: false, candidates: [] } };
  if (!session && name === "create_teaching_session") return createSession(appId, taskId);
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
  const operation = name === "create_teaching_session" ? "get_teaching_status" : name;
  const state = await recorderOperation(sandbox, operation, input);
  const browser = await browserRequest(`/${session.browserId}`) as Browser;
  return { session, state: { ...state, liveUrl: browser.liveUrl, expiresAt: session.expiresAt } };
}
