import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as Sentry from "@sentry/nextjs";
import { Agent, JsonlLocalAgentStore, type Run, type RunResult, type SDKAgent, type SDKUserMessage } from "@cursor/sdk";

export const claudeModelName = "claude-opus-5-5-low-fast";

function agentOptions(apiKey: string, cwd: string, storeDir: string, sandbox: boolean) {
  return {
    apiKey,
    model: { id: "claude-opus-5-5", params: [{ id: "context", value: "300k" }, { id: "effort", value: "low" }, { id: "fast", value: "true" }] },
    tools: [],
    local: { cwd, settingSources: [], sandboxOptions: { enabled: sandbox }, store: new JsonlLocalAgentStore(storeDir) },
  };
}

function isSandboxUnsupported(error: unknown) {
  return error instanceof Error && /sandboxing is not supported/i.test(error.message);
}

export async function runClaudeAgent(message: string | SDKUserMessage, apiKey: string, deadlineMs: number, timeout: () => Error): Promise<RunResult> {
  const dirs: string[] = [];
  let agent: SDKAgent | undefined;
  let run: Run | undefined;
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const removeDirs = () => Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true }))).then(() => {}, () => {});
  const dispose = async () => { await agent?.[Symbol.asyncDispose]().catch(() => {}); };
  const start = async (sandbox: boolean) => {
    agent = await Agent.create(agentOptions(apiKey, dirs[0], dirs[1], sandbox));
    if (timedOut) throw timeout();
    return agent.send(message);
  };
  const work = (async () => {
    dirs.push(await mkdtemp(join(tmpdir(), "claude-")));
    dirs.push(await mkdtemp(join(tmpdir(), "claude-store-")));
    if (timedOut) throw timeout();
    run = await start(true).catch(async (error) => {
      if (!isSandboxUnsupported(error)) throw error;
      Sentry.logger.warn("Claude agent sandbox is not supported here; running without it");
      await dispose();
      return start(false);
    });
    if (timedOut) await run.cancel();
    return run.wait();
  })();
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      reject(timeout());
    }, deadlineMs);
  });
  try {
    return await Promise.race([work, deadline]);
  } finally {
    clearTimeout(timer);
    if (timedOut) {
      await run?.cancel().catch(() => {});
      await removeDirs();
      void work.catch(() => {}).finally(async () => { await dispose(); await removeDirs(); });
    } else {
      await dispose();
      await removeDirs();
    }
  }
}
