import { BrowserUse } from "browser-use-sdk/v4";

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
const run = await client.runs.create({ task });
console.log(`Run started: ${run.id}`);

const result = await client.runs.waitForCompletion(run.id);
console.log(result.result);
