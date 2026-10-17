import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const serviceName = "com.mcparrot.teaching";
const launchDomain = `gui/${process.getuid()}`;
const serviceTarget = `${launchDomain}/${serviceName}`;
const projectDirectory = dirname(fileURLToPath(import.meta.url));
const serviceDirectory = resolve(homedir(), "Library/LaunchAgents");
const serviceFile = resolve(serviceDirectory, `${serviceName}.plist`);

function xml(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function launchctl(argumentsList) {
  const result = spawnSync("/bin/launchctl", argumentsList, { stdio: "ignore" });
  if (result.error) throw result.error;
  return result.status;
}

const previousConfiguration = existsSync(serviceFile) ? readFileSync(serviceFile, "utf8") : "";
const configuration = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${serviceName}</string>
<key>ProgramArguments</key><array><string>${xml(process.execPath)}</string><string>${xml(resolve(projectDirectory, "teaching-worker.mjs"))}</string></array>
<key>WorkingDirectory</key><string>${xml(projectDirectory)}</string>
<key>EnvironmentVariables</key><dict>
<key>MCPARROT_BROWSER_PROFILE</key><string>${xml(resolve(projectDirectory, ".local/headless-profile"))}</string>
<key>PATH</key><string>${xml(`${homedir()}/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin`)}</string>
</dict>
<key>RunAtLoad</key><true/>
<key>KeepAlive</key><true/>
<key>ThrottleInterval</key><integer>30</integer>
<key>StandardOutPath</key><string>/dev/null</string>
<key>StandardErrorPath</key><string>/dev/null</string>
</dict></plist>
`;

await mkdir(serviceDirectory, { recursive: true });
await writeFile(serviceFile, configuration, { mode: 0o600 });

const loaded = launchctl(["print", serviceTarget]) === 0;
const configurationChanged = previousConfiguration !== configuration;
if (loaded && configurationChanged && launchctl(["bootout", serviceTarget]) !== 0) {
  throw new Error("The local teaching service could not reload its settings.");
}
const status = loaded && !configurationChanged
  ? launchctl(["kickstart", serviceTarget])
  : launchctl(["bootstrap", launchDomain, serviceFile]);

if (status !== 0) throw new Error("The local teaching service could not start.");
console.log("The teaching helper runs at sign-in and restarts after failure.");
console.log("Connect Canvas from https://mcparrot.vercel.app.");
