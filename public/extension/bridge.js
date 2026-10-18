const dashboardOrigin = "https://mcparrot.vercel.app";
window.addEventListener("message", async (event) => {
  if (event.source !== window || event.origin !== dashboardOrigin) return;
  const message = event.data;
  if (message?.channel !== "mcparrot-explorer-request" || typeof message.id !== "string") return;
  if (!["status", "start", "stop", "clear"].includes(message.action)) return;
  if (!/^[a-zA-Z0-9-]{1,80}$/.test(message.appId)) return;
  try {
    const result = await chrome.runtime.sendMessage({ action: message.action, appId: message.appId });
    window.postMessage({ channel: "mcparrot-explorer-response", id: message.id, ...result }, dashboardOrigin);
  } catch {
    window.postMessage({ channel: "mcparrot-explorer-response", id: message.id, error: "Reload MCParrot after enabling the extension." }, dashboardOrigin);
  }
});
window.postMessage({ channel: "mcparrot-explorer-ready" }, dashboardOrigin);
