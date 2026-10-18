import { createHmac, randomUUID } from "node:crypto";
import * as Sentry from "@sentry/nextjs";
import { Redis } from "@upstash/redis";
import { BrowserUseError, type RunCreateBody, type SecretBinding } from "browser-use-sdk/v4";
import type { Page } from "playwright-core";
import { z } from "zod";
import { browserUse, errorReason, ignoreErrors, sessionBrowser, stopBrowser, stopWarmBrowser, withPage } from "./browser-use";
import { automaticSignInOf, type Website } from "./capabilities";
import { readLogin, type Login } from "./login";
import { signedOutMessage } from "./run-task";
import { findApp, updateStoredApp } from "./workspace";

const pendingSignInSeconds = 900;
const agentWaitMilliseconds = 150_000;
const callBudgetMilliseconds = 280_000;
const afterAgentMilliseconds = 20_000;
const rereadMilliseconds = 60_000;
const lockSeconds = 300;
const lockPollMilliseconds = 2_000;
const failedCooldownSeconds = 600;
const agentRunMaxCostUsd = 2;
const codeSentMessage = "MCParrot is signing in to the website, and the website sent a text-message code to the user's phone. Ask the user for that code, then call submit_verification_code with it.";
const codeRejectedMessage = "The website rejected that code. Ask the user for a new text-message code, then call submit_verification_code with it.";
const signInFinishedMessage = "Sign-in finished. Run the original tool again.";
const signInFinishedText = (toolName?: string) => toolName ? `Signed in. Call ${toolName} again with the same inputs.` : signInFinishedMessage;
const passwordRejectedMessage = "The website rejected the saved login. Open MCParrot, replace the login for this app, then try again.";
const signInFailedMessage = "Browser Use could not finish signing in. Open MCParrot and select Sign in to website on this app, then try again.";
const googleNeedsUserMessage = "Open MCParrot and select Sign in to website on this app, then try again.";
const noPendingSignInMessage = "No sign-in is waiting for a code. Run the original tool again to start signing in.";
const signInInProgressMessage = "MCParrot is already signing in to the website. Wait a minute, then run the original tool again.";
const signInInProgressText = (toolName?: string) => toolName ? `MCParrot is already signing in to the website. Wait a minute, then call ${toolName} again with the same inputs.` : signInInProgressMessage;
const signInTimedOutMessage = "Signing in to the website took too long. Wait a few minutes, then try again, or open MCParrot and select Sign in to website on this app.";
const userMessages = new Set([signedOutMessage, codeSentMessage, passwordRejectedMessage, signInFailedMessage, googleNeedsUserMessage, signInInProgressMessage, signInTimedOutMessage]);

const passwordOutcomes = ["signed_in", "code_sent", "password_rejected", "code_rejected", "failed"] as const;
const googleOutcomes = ["signed_in", "needs_user", "failed"] as const;
type ToolCall = { toolName: string; args?: unknown };
export type Rerun = (app: Website, toolName: string, args: unknown) => Promise<string> | undefined;
type PendingSignIn = { sessionId: string; browserId: string; cdpUrl: string } & Partial<ToolCall>;
type SigningInApp = Website & { browserProfileId: string };

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

const googleAccountStep = (googleEmail?: string) => googleEmail
  ? `When Google shows its account chooser, select the account ${googleEmail}. If that account is not shown, finish with outcome needs_user.`
  : "When Google shows its account chooser, select the only account shown. If it shows more than one account, finish with outcome needs_user.";

const googleSignInTask = (website: string, googleEmail?: string) => `Open ${website} and sign in with Google.
If the website already shows a signed-in page, finish with outcome signed_in.
Open the website's sign-in page and select "Continue with Google" or "Sign in with Google".
${googleAccountStep(googleEmail)}
If Google asks you to confirm or continue to ${website}, select Continue.
Never type anything on a Google page. If Google asks for an email, a password, a code, a phone number, or to verify that it's you, finish with outcome needs_user at once.
${finishSteps(website)}`;

const pendingKey = (appId: string) => `pending-sign-in:${appId}`;
const readPendingSignIn = (appId: string) => Redis.fromEnv().get<PendingSignIn>(pendingKey(appId));
const lockKey = (appId: string) => `sign-in-lock:${appId}`;
const rejectedKey = (appId: string) => `login-rejected:${appId}`;
const cooldownKey = (appId: string) => `sign-in-failed:${appId}`;

const loginHash = (app: Website, login: Login) =>
  createHmac("sha256", Buffer.from(process.env.MCPARROT_CREDENTIAL_KEY!, "base64")).update(JSON.stringify([login.username, login.password, app.loginSavedAt ?? ""])).digest("base64");

const isGone = (error: unknown) => error instanceof BrowserUseError && error.statusCode === 404;

const secret = (alias: string, value: string, allowedDomains: string[]): SecretBinding => ({ alias, source: { type: "inline", value }, allowedDomains });

async function frameHosts(page: Page) {
  const hosts = page.context().pages().flatMap((tab) => tab.frames()).map((frame) => new URL(frame.url()).hostname);
  return [...new Set(hosts.filter(Boolean))];
}

function runSignInAgent(appId: string, spanName: string, body: RunCreateBody, waitMilliseconds: number, outcomes: readonly [string, ...string[]] = passwordOutcomes) {
  const SignInResult = z.object({ outcome: z.enum(outcomes) });
  return Sentry.startSpan({ name: spanName }, async (span) => {
    let run: { id: string; sessionId: string } | undefined;
    let outcome = "failed";
    let timedOut = false;
    try {
      await stopWarmBrowser(appId);
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

async function stopSavingProfile(appId: string, browserId: string) {
  await stopWarmBrowser(appId);
  try {
    await stopBrowser(browserId);
  } catch (error) {
    if (!isGone(error)) throw error;
  }
}

async function profileId(app: Website) {
  const stored = (await findApp(app.id))?.app;
  if (stored?.browserProfileId) return stored.browserProfileId;
  const { id } = await browserUse().profiles.create({ name: `MCParrot ${app.name}` });
  await updateStoredApp(app.id, { browserProfileId: id });
  return id;
}

async function agentBrowser(appId: string, sessionId?: string) {
  if (!sessionId) return { lookupFailed: false };
  try {
    return { browser: await sessionBrowser(sessionId), lookupFailed: false };
  } catch (error) {
    Sentry.logger.warn("Sign-in browser lookup failed", { appId, reason: errorReason(error) });
    return { lookupFailed: true };
  }
}

async function finishSignedIn(appId: string, browserId: string | undefined, lookupFailed: boolean) {
  if (lookupFailed) throw new Error(signInFailedMessage);
  if (browserId) await stopSavingProfile(appId, browserId);
  await updateStoredApp(appId, { signedInAt: new Date().toISOString() });
}

async function signIn(app: SigningInApp, login: Login, hash: string, waitMilliseconds: number, call?: ToolCall) {
  Sentry.logger.info("Automatic sign-in started", { appId: app.id });
  const { sessionId, outcome, timedOut } = await runSignInAgent(app.id, "browser_use.agent_sign_in", {
    task: signInTask(app.url),
    browserSettings: { profileId: app.browserProfileId },
    secretBindings: [secret("username", login.username, login.hosts), secret("password", login.password, login.hosts)],
  }, waitMilliseconds);
  Sentry.logger.info("Automatic sign-in finished", { appId: app.id, outcome });
  const { browser, lookupFailed } = await agentBrowser(app.id, sessionId);
  if (outcome === "code_sent" && browser) {
    await Redis.fromEnv().set(pendingKey(app.id), { sessionId, browserId: browser.id, cdpUrl: browser.cdpUrl, ...call }, { ex: pendingSignInSeconds });
    return codeSentMessage;
  }
  const browserId = browser?.id;
  if (outcome === "signed_in") return finishSignedIn(app.id, browserId, lookupFailed);
  if (browserId) await ignoreErrors(() => stopBrowser(browserId));
  if (outcome === "password_rejected") {
    await Redis.fromEnv().set(rejectedKey(app.id), hash);
    throw new Error(passwordRejectedMessage);
  }
  await Redis.fromEnv().set(cooldownKey(app.id), hash, { ex: failedCooldownSeconds });
  throw new Error(timedOut ? signInTimedOutMessage : signInFailedMessage);
}

async function googleSignIn(app: SigningInApp, googleEmail: string | undefined, attempt: string, waitMilliseconds: number) {
  Sentry.logger.info("Automatic Google sign-in started", { appId: app.id });
  const { sessionId, outcome, timedOut } = await runSignInAgent(app.id, "browser_use.agent_google_sign_in", {
    task: googleSignInTask(app.url, googleEmail),
    browserSettings: { profileId: app.browserProfileId },
  }, waitMilliseconds, googleOutcomes);
  Sentry.logger.info("Automatic Google sign-in finished", { appId: app.id, outcome });
  const { browser, lookupFailed } = await agentBrowser(app.id, sessionId);
  const browserId = browser?.id;
  if (outcome === "signed_in") return finishSignedIn(app.id, browserId, lookupFailed);
  if (browserId) await ignoreErrors(() => stopBrowser(browserId));
  await Redis.fromEnv().set(cooldownKey(app.id), attempt, { ex: failedCooldownSeconds });
  if (outcome === "needs_user") throw new Error(googleNeedsUserMessage);
  throw new Error(timedOut ? signInTimedOutMessage : signInFailedMessage);
}

const usesPassword = (app: Website) => automaticSignInOf(app).method === "password";
const pause = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitingForCode(appId: string) {
  const pending = await readPendingSignIn(appId);
  if (!pending) return false;
  try {
    if ((await browserUse().browsers.get(pending.browserId)).status === "active") return true;
  } catch (error) {
    if (!isGone(error)) return true;
  }
  await Redis.fromEnv().del(pendingKey(appId));
  return false;
}

export async function withLock<T>(key: string, busyMessage: string, work: () => Promise<T>) {
  const redis = Redis.fromEnv();
  const nonce = randomUUID();
  if (await redis.set(key, nonce, { nx: true, ex: lockSeconds }) === null) return busyMessage;
  try {
    return await work();
  } finally {
    await ignoreErrors(async () => {
      if (await redis.get(key) === nonce) await redis.del(key);
    });
  }
}

const withSignInLock = <T>(appId: string, work: () => Promise<T>) => withLock(lockKey(appId), signInInProgressMessage, work);

const guardedSignIn = <T>(app: Website, work: () => Promise<T>) => withSignInLock(app.id, async () => {
  try {
    return await work();
  } catch (error) {
    if (userMessages.has((error as Error).message)) throw error;
    Sentry.logger.warn("Automatic sign-in failed", { appId: app.id, reason: errorReason(error) });
    throw new Error(signInFailedMessage);
  }
});

async function agentWaitWithin(appId: string, attempt: string, deadline: number) {
  if (await Redis.fromEnv().get(cooldownKey(appId)) === attempt) throw new Error(signInFailedMessage);
  const waitMilliseconds = Math.min(agentWaitMilliseconds, deadline - Date.now() - afterAgentMilliseconds);
  if (waitMilliseconds < afterAgentMilliseconds) throw new Error(signInTimedOutMessage);
  return waitMilliseconds;
}

const signInOnce = (app: Website, login: Login, deadline: number, call?: ToolCall) => guardedSignIn(app, async () => {
  if (await waitingForCode(app.id)) return codeSentMessage;
  const hash = loginHash(app, login);
  if (await Redis.fromEnv().get(rejectedKey(app.id)) === hash) throw new Error(passwordRejectedMessage);
  const waitMilliseconds = await agentWaitWithin(app.id, hash, deadline);
  const signingInApp = { ...app, browserProfileId: await profileId(app) };
  return await signIn(signingInApp, login, hash, waitMilliseconds, call) ?? signingInApp;
});

const googleSignInOnce = (app: Website, googleEmail: string | undefined, deadline: number) => guardedSignIn(app, async () => {
  const { browserProfileId } = app;
  if (!browserProfileId) throw new Error(googleNeedsUserMessage);
  const attempt = JSON.stringify(["google", googleEmail ?? ""]);
  const waitMilliseconds = await agentWaitWithin(app.id, attempt, deadline);
  const signingInApp = { ...app, browserProfileId };
  await googleSignIn(signingInApp, googleEmail, attempt, waitMilliseconds);
  return signingInApp;
});

async function signInAgain(app: Website, deadline: number, call?: ToolCall) {
  const automaticSignIn = automaticSignInOf(app);
  if (automaticSignIn.method === "google") return googleSignInOnce(app, automaticSignIn.googleEmail, deadline);
  const login = automaticSignIn.method === "password" ? await readLogin(app.id) : null;
  if (!login) throw new Error(signedOutMessage);
  return signInOnce(app, login, deadline, call);
}

async function signInReleased(appId: string, until: number) {
  for (;;) {
    if (!await Redis.fromEnv().exists(lockKey(appId))) return true;
    if (Date.now() + lockPollMilliseconds > until) return false;
    await pause(lockPollMilliseconds);
  }
}

async function readAfterOtherSignIn<T>(app: Website, read: (app: Website) => Promise<T>, deadline: number, call?: ToolCall): Promise<T | string> {
  const started = Date.now();
  const released = await signInReleased(app.id, deadline - rereadMilliseconds);
  Sentry.logger.info("Waited for another sign-in", { appId: app.id, released, waitedMs: Date.now() - started });
  if (!released) return signInInProgressText(call?.toolName);
  const storedApp = (await findApp(app.id))?.app ?? app;
  if (usesPassword(storedApp) && await waitingForCode(storedApp.id)) return codeSentMessage;
  return read(storedApp);
}

export async function readSigningIn<T>(app: Website, read: (app: Website) => Promise<T>, call?: ToolCall): Promise<T | string> {
  const deadline = Date.now() + callBudgetMilliseconds;
  if (usesPassword(app) && await waitingForCode(app.id)) return codeSentMessage;
  try {
    return await read(app);
  } catch (error) {
    if ((error as Error).message !== signedOutMessage) throw error;
  }
  const signedIn = await signInAgain(app, deadline, call);
  if (signedIn === signInInProgressMessage) return readAfterOtherSignIn(app, read, deadline, call);
  if (typeof signedIn === "string") return signedIn;
  return deadline - Date.now() < rereadMilliseconds ? signInFinishedText(call?.toolName) : read(signedIn);
}

const finishCodeSignIn = (app: Website, code: string) => withSignInLock(app.id, async () => {
  const pending = usesPassword(app) && await readPendingSignIn(app.id);
  if (!pending) throw new Error(noPendingSignInMessage);
  let outcome = "failed";
  try {
    const hosts = await withPage(pending.cdpUrl, frameHosts);
    ({ outcome } = await runSignInAgent(app.id, "browser_use.agent_verification_code", {
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
  let stopped = true;
  try {
    await stopSavingProfile(app.id, pending.browserId);
  } catch (error) {
    stopped = false;
    Sentry.logger.warn("Sign-in browser stop failed", { appId: app.id, reason: errorReason(error) });
  }
  await Redis.fromEnv().del(pendingKey(app.id));
  if (outcome !== "signed_in" || !stopped) throw new Error(signInFailedMessage);
  await updateStoredApp(app.id, { signedInAt: new Date().toISOString() });
  return pending;
});

export async function submitVerificationCode(app: Website, code: string, rerun?: Rerun) {
  const deadline = Date.now() + callBudgetMilliseconds;
  const signedIn = await finishCodeSignIn(app, code);
  if (typeof signedIn === "string") return signedIn;
  const { toolName, args } = signedIn;
  const answer = toolName && rerun && deadline - Date.now() >= rereadMilliseconds ? await rerun((await findApp(app.id))?.app ?? app, toolName, args) : undefined;
  return answer ?? signInFinishedText(toolName);
}
