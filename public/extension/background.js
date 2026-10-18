const canvasOrigin = "https://bcourses.berkeley.edu";
const dashboardOrigin = "https://mcparrot.vercel.app";
const maximumCandidates = 100;
let updates = Promise.resolve();

function update(operation) {
  const result = updates.then(operation);
  updates = result.catch(() => {});
  return result;
}

function candidateFromRequest(request) {
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== canvasOrigin) return;
  const syllabus = /^\/courses\/\d+\/assignments\/syllabus$/.test(url.pathname);
  const api = /^\/api\/v1\/courses\/\d+(?:\/(?:assignments|assignment_groups|modules|pages|folders|files|front_page|tabs|discussion_topics|quizzes)(?:\/\d+)*)?$/.test(url.pathname);
  if (!api && !syllabus) return;
  const courseId = url.pathname.match(/\/courses\/(\d+)/)[1];
  const label = syllabus ? "Read syllabus" : `Read ${url.pathname.split("/")[5]?.replaceAll("_", " ") ?? "course information"}`;
  return { id: url.pathname, path: url.pathname, label, courseId, kind: syllabus ? "syllabus" : "json" };
}

chrome.webRequest.onBeforeRequest.addListener((request) => {
  const candidate = candidateFromRequest(request);
  if (!candidate || request.tabId < 0) return;
  void update(async () => {
    const { active } = await chrome.storage.session.get("active");
    const { explorations = {} } = await chrome.storage.local.get("explorations");
    if (!active || active.tabId !== request.tabId) return;
    const candidates = explorations[active.appId] ?? [];
    if (candidates.length >= maximumCandidates || candidates.some(({ id }) => id === candidate.id)) return;
    explorations[active.appId] = [...candidates, candidate];
    await chrome.storage.local.set({ explorations });
  });
}, { urls: [`${canvasOrigin}/*`], types: ["xmlhttprequest", "main_frame"] });

async function status(appId) {
  const { active } = await chrome.storage.session.get("active");
  const { explorations = {} } = await chrome.storage.local.get("explorations");
  return { recording: active?.appId === appId, candidates: explorations[appId] ?? [] };
}

async function operate({ action, appId }) {
  if (action === "status") return status(appId);
  if (action === "start") {
    const { active } = await chrome.storage.session.get("active");
    if (active) throw new Error("Stop your current exploration before opening another.");
    const tab = await chrome.tabs.create({ url: "about:blank" });
    await chrome.storage.session.set({ active: { appId, tabId: tab.id } });
    await chrome.tabs.update(tab.id, { url: canvasOrigin });
    return status(appId);
  }
  const { active } = await chrome.storage.session.get("active");
  const { explorations = {} } = await chrome.storage.local.get("explorations");
  if (active?.appId === appId) await chrome.storage.session.remove("active");
  if (action === "clear") {
    delete explorations[appId];
    await chrome.storage.local.set({ explorations });
  }
  return status(appId);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (new URL(sender.url ?? "about:blank").origin !== dashboardOrigin) return;
  if (!["status", "start", "stop", "clear"].includes(message.action) || !/^[a-zA-Z0-9-]{1,80}$/.test(message.appId)) return;
  update(() => operate(message)).then((state) => sendResponse({ state }), () => sendResponse({ error: "The browser could not change exploration. Stop any current exploration, then try again." }));
  return true;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void update(async () => {
    const { active } = await chrome.storage.session.get("active");
    if (active?.tabId === tabId) await chrome.storage.session.remove("active");
  });
});

