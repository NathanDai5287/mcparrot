import { spawn } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { setTimeout } from "node:timers/promises";

const profileDirectory = resolve(".local/headless-profile");
const browserUse = resolve(homedir(), ".local/bin/browser-use");
const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const readinessAttempts = 50;
const readinessInterval = 200;
let browserEndpoint;

async function waitForBrowser() {
  for (let attempt = 0; attempt < readinessAttempts; attempt += 1) {
    await setTimeout(readinessInterval);
    try {
      const portFile = await readFile(resolve(profileDirectory, "DevToolsActivePort"), "utf8");
      const endpoint = `http://127.0.0.1:${Number(portFile.split("\n")[0])}`;
      const response = await fetch(`${endpoint}/json/version`);
      if (response.ok) return endpoint;
    } catch {
      continue;
    }
  }
  throw new Error("The local headless browser did not become ready.");
}

async function startBrowser() {
  if (browserEndpoint) return browserEndpoint;
  await mkdir(profileDirectory, { recursive: true, mode: 0o700 });
  const browser = spawn(chrome, [
    `--user-data-dir=${profileDirectory}`,
    "--headless=new",
    "--remote-debugging-port=0",
    "--remote-debugging-address=127.0.0.1",
    "--no-first-run",
    "--no-default-browser-check",
    "about:blank",
  ], { detached: true, stdio: "ignore" });
  browser.unref();
  browserEndpoint = await waitForBrowser();
  return browserEndpoint;
}

export async function runBrowserCode(code, payload = {}) {
  const endpoint = await startBrowser();
  return new Promise((resolveResult, reject) => {
    const child = spawn(browserUse, [], {
      env: {
        ...process.env,
        BU_CDP_URL: endpoint,
        BU_NAME: "mcparrot-headless",
        BH_RECORD: "0",
        BH_TAB_MARKER: "0",
        BH_TELEMETRY: "0",
        ANONYMIZED_TELEMETRY: "false",
        DO_NOT_TRACK: "1",
      },
      stdio: ["pipe", "pipe", "ignore", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.on("error", () => reject(new Error("Browser Use could not start.")));
    child.on("close", (status) => {
      if (status !== 0) return reject(new Error("The browser action failed. Check the current sign-in step."));
      resolveResult(output.trim());
    });
    child.stdin.end(code);
    child.stdio[3].end(JSON.stringify(payload));
  });
}

if (import.meta.main) {
  const website = new URL(process.argv[2] ?? "https://example.com");
  if (!["http:", "https:"].includes(website.protocol)) throw new Error("Use an HTTP or HTTPS website address.");
  await runBrowserCode([
    "new_tab()",
    "activate_tab(current_tab())",
    "cdp(\"Emulation.setFocusEmulationEnabled\", enabled=True)",
    "cdp(\"Emulation.setDeviceMetricsOverride\", width=1280, height=900, deviceScaleFactor=1, mobile=False)",
    `cdp("Page.navigate", url=${JSON.stringify(website.href)}, _response_timeout=30)`,
    'print("Local headless Browser Use is connected.")',
  ].join("\n"));
  console.log("Local headless Browser Use is connected.");
}
