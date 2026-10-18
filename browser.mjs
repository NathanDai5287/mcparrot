// @ts-check
import { constants } from "node:os";
import { BrowserUse } from "browser-use-sdk/v4";

const RUN_TIMEOUT_MS = 15 * 60 * 1000;

const task = process.argv.slice(2).join(" ").trim();

if (!task) {
  console.error('Usage: npm run browser -- "Your browser task"');
  process.exit(1);
}

if (!process.env.BROWSER_USE_API_KEY) {
  console.error("Set BROWSER_USE_API_KEY in .env before you start.");
  process.exit(1);
}

const client = new BrowserUse();
const created = client.runs.create({ task });
let finished = false;

/** @param {unknown} error */
const errorMessage = (error) => (error instanceof Error ? error.message : String(error));

async function cancelRun() {
  if (finished) return;
  finished = true;
  let runId;
  try {
    runId = (await created).id;
    await client.runs.cancel(runId);
    console.error(`Run cancelled: ${runId}`);
  } catch (error) {
    if (runId) console.error(`Could not cancel run ${runId}: ${errorMessage(error)}`);
  }
}

for (const signal of /** @type {const} */ (["SIGINT", "SIGTERM", "SIGHUP"])) {
  process.once(signal, async () => {
    await cancelRun();
    process.exit(128 + constants.signals[signal]);
  });
}

try {
  const run = await created;
  console.log(`Run started: ${run.id}`);

  const result = await client.runs.waitForCompletion(run.id, { timeout: RUN_TIMEOUT_MS });
  finished = true;
  if (result.status === "completed") {
    console.log(result.result);
  } else {
    console.error(`Run ${result.status}: ${run.id}`);
    process.exitCode = 1;
  }
} catch (error) {
  console.error(errorMessage(error));
  process.exitCode = 1;
} finally {
  await cancelRun();
}
