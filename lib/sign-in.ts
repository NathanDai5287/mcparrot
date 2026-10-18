import { createHmac, randomUUID } from "node:crypto";
import * as Sentry from "@sentry/nextjs";
import { Redis } from "@upstash/redis";
import { BrowserUseError, type RunCreateBody, type SecretBinding } from "browser-use-sdk/v4";
import type { Page } from "playwright-core";
import { z } from "zod";
import { browserUse, stopBrowser, withPage } from "./browser-use";
import type { Website } from "./capabilities";
import { readLogin, type Login } from "./login";
import { signedOutMessage } from "./run-task";
import { readWorkspace, updateStoredApp } from "./workspace";

const pendingSignInSeconds = 900;
const agentWaitMilliseconds = 150_000;
const callBudgetMilliseconds = 280_000;
const afterAgentMilliseconds = 20_000;
const rereadMilliseconds = 60_000;
const signInLockSeconds = 300;
const failedCooldownSeconds = 600;
const agentRunMaxCostUsd = 2;
const codeSentMessage = "MCParrot is signing in to the website, and the website sent a text-message code to the user's phone. Ask the user for that code, then call submit_verification_code with it.";
const codeRejectedMessage = "The website rejected that code. Ask the user for a new text-message code, then call submit_verification_code with it.";
const signInFinishedMessage = "Sign-in finished. Run the original task again.";
const passwordRejectedMessage = "The website rejected the saved login. Open MCParrot, replace the login for this app, then try again.";
const signInFailedMessage = "Browser Use could not finish signing in. Open MCParrot and select Sign in to website on this app, then try again.";
const noPendingSignInMessage = "No sign-in is waiting for a code. Run the original task again to start signing in.";
const signInInProgressMessage = "MCParrot is already signing in to the website. Wait a minute, then run the original task again.";
const signInTimedOutMessage = "Signing in to the website took too long. Wait a few minutes, then try again, or open MCParrot and select Sign in to website on this app.";
const userMessages = new Set([signedOutMessage, codeSentMessage, passwordRejectedMessage, signInFailedMessage, signInInProgressMessage, signInTimedOutMessage]);

const SignInResult = z.object({ outcome: z.enum(["signed_in", "code_sent", "password_rejected", "code_rejected", "failed"]) });
type PendingSignIn = { sessionId: string; browserId: string; cdpUrl: string };

const trustDeviceStep = `If the website asks whether to trust this browser or device, choose no, for example "No, other people use this device".`;
const finishSteps = (website: string) => `When ${website} shows its signed-in page, finish with outcome signed_in. If anything else stops sign-in, finish with outcome failed.`;

const signInTask = (website: string) => `Open ${website} and sign in.
If the website already shows a signed-in page, finish with outcome signed_in.
Type the secret username into the username field and the secret password into the password field, then submit the form once. Never submit the password a second time.
If the website says the username or password is wrong, finish with outcome password_rejected.
If the website asks for verification, choose to get a text message (SMS) passcode, and open "Other options" if that choice is not visible. As soon as the page asks for the passcode, finish with outcome code_sent.
${trustDeviceStep}
${finishSteps(website)}`;

const codeTask = (website: string) => `Type the secret verification_code into the passcode field on the open verification page and submit it.
If the page says the code is wrong or expired, request a new text-message (SMS) passcode, then finish with outcome code_rejected.
${trustDeviceStep}
${finishSteps(website)}`;

const pendingKey = (appId: string) => `pending-sign-in:${appId}`;
const readPendingSignIn = (appId: string) => Redis.fromEnv().get<PendingSignIn>(pendingKey(appId));
const lockKey = (appId: string) => `sign-in-lock:${appId}`;
const rejectedKey = (appId: string) => `login-rejected:${appId}`;
const cooldownKey = (appId: string) => `sign-in-failed:${appId}`;

const loginHash = (app: Website, login: Login) =>
  createHmac("sha256", Buffer.from(process.env.MCPARROT_CREDENTIAL_KEY!, "base64")).update(JSON.stringify([login.username, login.password, app.loginSavedAt ?? ""])).digest("base64");

const errorReason = (error: unknown) => error instanceof BrowserUseError ? `BrowserUseError ${error.statusCode}` : (error as Error)?.name ?? "unknown";
const ignoreErrors = async (work: () => Promise<unknown>) => { try { await work(); } catch {} };

const secret = (alias: string, value: string, allowedDomains: string[]): SecretBinding => ({ alias, source: { type: "inline", value }, allowedDomains });

async function frameHosts(page: Page) {
  const hosts = page.context().pages().flatMap((tab) => tab.frames()).map((frame) => new URL(frame.url()).hostname);
  return [...new Set(hosts.filter(Boolean))];
}

function runSignInAgent(spanName: string, body: RunCreateBody, waitMilliseconds: number) {
  return Sentry.startSpan({ name: spanName }, async (span) => {
    let run: { id: string; sessionId: string } | undefined;
    let outcome: z.infer<typeof SignInResult>["outcome"] = "failed";
    let timedOut = false;
    try {
      run = await browserUse().runs.create({ ...body, keepAlive: pendingSignInSeconds, maxCostUsd: agentRunMaxCostUsd, outputSchema: z.toJSONSchema(SignInResult) });
      const finished = await browserUse().runs.waitForCompletion(run.id, { timeout: waitMilliseconds });
      const result = SignInResult.safeParse(finished.output);
      if (finished.status === "completed" && result.success) outcome = result.data.outcome;
      else Sentry.logger.warn("Sign-in agent run gave no outcome", { status: finished.status });
    } catch (error) {
      timedOut = !!run && !(error instanceof BrowserUseError);
      Sentry.logger.warn("Sign-in agent run did not finish", { reason: errorReason(error), timedOut });
      const runId = run?.id;
      if (runId) await ignoreErrors(() => browserUse().runs.cancel(runId));
    }
    span.setAttribute("sign_in.outcome", outcome);
    return { sessionId: run?.sessionId, outcome, timedOut };
  });
}

async function sessionBrowser(sessionId: string) {
  const { items } = await browserUse().browsers.list({ agentSessionId: sessionId, filterBy: "active" });
  return items[0];
}

async function profileId(app: Website) {
  const stored = (await readWorkspace())?.find((storedApp) => storedApp.id === app.id);
  if (stored?.browserProfileId) return stored.browserProfileId;
  const { id } = await browserUse().profiles.create({ name: `MCParrot ${app.name}` });
  await updateStoredApp(app.id, { browserProfileId: id });
  return id;
}

async function signIn(app: Website & { browserProfileId: string }, login: Login, hash: string, waitMilliseconds: number) {
  Sentry.logger.info("Automatic sign-in started", { appId: app.id });
  const { sessionId, outcome, timedOut } = await runSignInAgent("browser_use.agent_sign_in", {
    task: signInTask(app.url),
    browserSettings: { profileId: app.browserProfileId },
    secretBindings: [secret("username", login.username, login.hosts), secret("password", login.password, login.hosts)],
  }, waitMilliseconds);
  Sentry.logger.info("Automatic sign-in finished", { appId: app.id, outcome });
  let browser: Awaited<ReturnType<typeof sessionBrowser>> | undefined;
  if (sessionId) {
    try {
      browser = await sessionBrowser(sessionId);
    } catch (error) {
      Sentry.logger.warn("Sign-in browser lookup failed", { appId: app.id, reason: errorReason(error) });
    }
  }
  if (outcome === "code_sent" && browser) {
    await Redis.fromEnv().set(pendingKey(app.id), { sessionId, browserId: browser.id, cdpUrl: browser.cdpUrl }, { ex: pendingSignInSeconds });
    return codeSentMessage;
  }
  const browserId = browser?.id;
  if (browserId) await ignoreErrors(() => stopBrowser(browserId));
  if (outcome === "password_rejected") {
    await Redis.fromEnv().set(rejectedKey(app.id), hash);
    throw new Error(passwordRejectedMessage);
  }
  if (outcome !== "signed_in") {
    await Redis.fromEnv().set(cooldownKey(app.id), hash, { ex: failedCooldownSeconds });
    throw new Error(timedOut ? signInTimedOutMessage : signInFailedMessage);
  }
  await updateStoredApp(app.id, { signedInAt: new Date().toISOString() });
}

async function waitingForCode(appId: string) {
  const pending = await readPendingSignIn(appId);
  if (!pending) return false;
  try {
    if ((await browserUse().browsers.get(pending.browserId)).status === "active") return true;
  } catch (error) {
    if (!(error instanceof BrowserUseError && error.statusCode === 404)) return true;
  }
  await Redis.fromEnv().del(pendingKey(appId));
  return false;
}

async function signInOnce(app: Website, login: Login, deadline: number) {
  const redis = Redis.fromEnv();
  const nonce = randomUUID();
  if (await redis.set(lockKey(app.id), nonce, { nx: true, ex: signInLockSeconds }) === null) return signInInProgressMessage;
  try {
    if (await waitingForCode(app.id)) return codeSentMessage;
    const hash = loginHash(app, login);
    if (await redis.get(rejectedKey(app.id)) === hash) throw new Error(passwordRejectedMessage);
    if (await redis.get(cooldownKey(app.id)) === hash) throw new Error(signInFailedMessage);
    const waitMilliseconds = Math.min(agentWaitMilliseconds, deadline - Date.now() - afterAgentMilliseconds);
    if (waitMilliseconds < afterAgentMilliseconds) throw new Error(signInTimedOutMessage);
    const signingInApp = { ...app, browserProfileId: await profileId(app) };
    return await signIn(signingInApp, login, hash, waitMilliseconds) ?? signingInApp;
  } catch (error) {
    if (userMessages.has((error as Error).message)) throw error;
    Sentry.logger.warn("Automatic sign-in failed", { appId: app.id, reason: errorReason(error) });
    throw new Error(signInFailedMessage);
  } finally {
    await ignoreErrors(async () => {
      if (await redis.get(lockKey(app.id)) === nonce) await redis.del(lockKey(app.id));
    });
  }
}

export async function readSigningIn(app: Website, read: (app: Website) => Promise<string>) {
  const deadline = Date.now() + callBudgetMilliseconds;
  if (await waitingForCode(app.id)) return codeSentMessage;
  try {
    return await read(app);
  } catch (error) {
    if ((error as Error).message !== signedOutMessage) throw error;
  }
  const login = await readLogin(app.id);
  if (!login) throw new Error(signedOutMessage);
  const signedIn = await signInOnce(app, login, deadline);
  if (typeof signedIn === "string") return signedIn;
  return deadline - Date.now() < rereadMilliseconds ? signInFinishedMessage : read(signedIn);
}

export async function submitVerificationCode(app: Website, code: string) {
  const pending = await readPendingSignIn(app.id);
  if (!pending) throw new Error(noPendingSignInMessage);
  let outcome = "failed";
  try {
    const hosts = await withPage(pending.cdpUrl, frameHosts);
    ({ outcome } = await runSignInAgent("browser_use.agent_verification_code", {
      task: codeTask(app.url),
      sessionId: pending.sessionId,
      secretBindings: [secret("verification_code", code, hosts)],
    }, agentWaitMilliseconds));
  } catch (error) {
    Sentry.logger.warn("Verification code failed", { appId: app.id, reason: errorReason(error) });
  }
  Sentry.logger.info("Verification code finished", { appId: app.id, outcome });
  if (outcome === "code_rejected") {
    await Redis.fromEnv().expire(pendingKey(app.id), pendingSignInSeconds);
    return codeRejectedMessage;
  }
  await ignoreErrors(() => stopBrowser(pending.browserId));
  await Redis.fromEnv().del(pendingKey(app.id));
  if (outcome !== "signed_in") throw new Error(signInFailedMessage);
  await updateStoredApp(app.id, { signedInAt: new Date().toISOString() });
  return signInFinishedMessage;
}
