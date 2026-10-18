const dashboardOrigins = ["https://mcparrot.vercel.app", "http://localhost:4317", "http://127.0.0.1:4317"];
const origin = window.location.origin;
const version = chrome.runtime.getManifest().version;
window.addEventListener("message", async (event) => {
  if (event.source !== window || !dashboardOrigins.includes(event.origin)) return;
  const message = event.data;
  if (message?.channel !== "mcparrot-explorer-request" || typeof message.id !== "string") return;
  if (!["status", "start", "stop", "clear"].includes(message.action)) return;
  if (!/^[a-zA-Z0-9-]{1,80}$/.test(message.appId)) return;
  try {
    const result = await chrome.runtime.sendMessage({ action: message.action, appId: message.appId, websiteUrl: message.websiteUrl });
    window.postMessage({ channel: "mcparrot-explorer-response", id: message.id, version, ...result }, origin);
  } catch {
    window.postMessage({ channel: "mcparrot-explorer-response", id: message.id, version, error: "Reload MCParrot after enabling the extension." }, origin);
  }
});
window.postMessage({ channel: "mcparrot-explorer-ready", version }, origin);
