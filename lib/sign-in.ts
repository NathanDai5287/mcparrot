import * as Sentry from "@sentry/nextjs";
import { Redis } from "@upstash/redis";
import type { RunCreateBody, SecretBinding } from "browser-use-sdk/v4";
import type { Page } from "playwright-core";
import { z } from "zod";
import { browserUse, stopBrowser, withPage } from "./browser-use";
import type { Task, Website } from "./capabilities";
import { readLogin, type Login } from "./login";
import { runTask, signedOutMessage, type TaskInputs } from "./run-task";
import { updateStoredApp } from "./workspace";

const pendingSignInSeconds = 900;
const agentWaitMilliseconds = 220_000;
const codeSentMessage = "MCParrot is signing in to the website, and the website sent a text-message code to the user's phone. Ask the user for that code, then call submit_verification_code with it.";
const codeRejectedMessage = "The website rejected that code. Ask the user for a new text-message code, then call submit_verification_code with it.";
const signInFinishedMessage = "Sign-in finished. Run the original task again.";
const passwordRejectedMessage = "The website rejected the saved login. Open MCParrot, replace the login for this app, then try again.";
const signInFailedMessage = "Browser Use could not finish signing in. Open MCParrot and select Sign in to website on this app, then try again.";
const noPendingSignInMessage = "No sign-in is waiting for a code. Run the original task again to start signing in.";

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
If the page says the code is wrong or expired, finish with outcome code_rejected.
${trustDeviceStep}
${finishSteps(website)}`;

const pendingKey = (appId: string) => `pending-sign-in:${appId}`;
const readPendingSignIn = (appId: string) => Redis.fromEnv().get<PendingSignIn>(pendingKey(appId));

const secret = (alias: string, value: string, allowedDomains: string[]): SecretBinding => ({ alias, source: { type: "inline", value }, allowedDomains });

async function frameHosts(page: Page) {
  const hosts = page.context().pages().flatMap((tab) => tab.frames()).map((frame) => new URL(frame.url()).hostname);
  return [...new Set(hosts.filter(Boolean))];
}

function runSignInAgent(spanName: string, body: RunCreateBody) {
  return Sentry.startSpan({ name: spanName }, async (span) => {
    const run = await browserUse().runs.create({ ...body, keepAlive: pendingSignInSeconds, outputSchema: z.toJSONSchema(SignInResult) });
    const finished = await browserUse().runs.waitForCompletion(run.id, { timeout: agentWaitMilliseconds });
    const outcome = finished.status === "completed" ? SignInResult.parse(finished.output).outcome : "failed";
    span.setAttribute("sign_in.outcome", outcome);
    return { sessionId: run.sessionId, outcome };
  });
}

async function sessionBrowser(sessionId: string) {
  const { items } = await browserUse().browsers.list({ agentSessionId: sessionId, filterBy: "active" });
  return items[0];
}

async function createProfile(app: Website) {
  const { id } = await browserUse().profiles.create({ name: `MCParrot ${app.name}` });
  await updateStoredApp(app.id, { browserProfileId: id });
  return id;
}

async function signIn(app: Website & { browserProfileId: string }, login: Login) {
  Sentry.logger.info("Automatic sign-in started", { appId: app.id });
  const { sessionId, outcome } = await runSignInAgent("browser_use.agent_sign_in", {
    task: signInTask(app.url),
    browserSettings: { profileId: app.browserProfileId },
    secretBindings: [secret("username", login.username, login.hosts), secret("password", login.password, login.hosts)],
  });
  Sentry.logger.info("Automatic sign-in finished", { appId: app.id, outcome });
  const browser = await sessionBrowser(sessionId);
  if (outcome === "code_sent" && browser) {
    await Redis.fromEnv().set(pendingKey(app.id), { sessionId, browserId: browser.id, cdpUrl: browser.cdpUrl }, { ex: pendingSignInSeconds });
    return codeSentMessage;
  }
  if (browser) await stopBrowser(browser.id);
  if (outcome === "password_rejected") throw new Error(passwordRejectedMessage);
  if (outcome !== "signed_in") throw new Error(signInFailedMessage);
  await updateStoredApp(app.id, { signedInAt: new Date().toISOString() });
}

export async function runTaskSigningIn(app: Website, task: Task, inputs: TaskInputs) {
  try {
    return await runTask(app, task, inputs);
  } catch (error) {
    if ((error as Error).message !== signedOutMessage) throw error;
  }
  const login = await readLogin(app.id);
  if (!login) throw new Error(signedOutMessage);
  if (await readPendingSignIn(app.id)) return codeSentMessage;
  const signingInApp = { ...app, browserProfileId: app.browserProfileId ?? await createProfile(app) };
  return await signIn(signingInApp, login) ?? runTask(signingInApp, task, inputs);
}

export async function submitVerificationCode(app: Website, code: string) {
  const pending = await readPendingSignIn(app.id);
  if (!pending) throw new Error(noPendingSignInMessage);
  const hosts = await withPage(pending.cdpUrl, frameHosts);
  const { outcome } = await runSignInAgent("browser_use.agent_verification_code", {
    task: codeTask(app.url),
    sessionId: pending.sessionId,
    secretBindings: [secret("verification_code", code, hosts)],
  });
  Sentry.logger.info("Verification code finished", { appId: app.id, outcome });
  if (outcome === "code_rejected") {
    await Redis.fromEnv().expire(pendingKey(app.id), pendingSignInSeconds);
    return codeRejectedMessage;
  }
  await stopBrowser(pending.browserId);
  await Redis.fromEnv().del(pendingKey(app.id));
  if (outcome !== "signed_in") throw new Error(signInFailedMessage);
  await updateStoredApp(app.id, { signedInAt: new Date().toISOString() });
  return signInFinishedMessage;
}
