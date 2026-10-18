import * as Sentry from "@sentry/nextjs";
import type { Capability, Website } from "./capabilities";
import { addressOnWebsite } from "./run-task";
import { updateStoredApp } from "./workspace";

export type PageTask = Omit<Capability, "requests"> & { urlPattern: string };

const connectionToolNames = ["read_page", "save_task", "submit_verification_code"];

export function toolName(taskName: string) {
  return taskName.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 64);
}

const placeholders = (urlPattern: string) => [...new Set([...urlPattern.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]))];

const sameNames = (first: string[], second: string[]) => first.length === second.length && [...first].sort().join("\n") === [...second].sort().join("\n");

const withoutPlaceholderNames = (urlPattern: string) => urlPattern.replace(/\{[^}]+\}/g, "{}");

function rejectionReason(app: Website, { name, urlPattern, inputs }: PageTask) {
  const address = addressOnWebsite(app, withoutPlaceholderNames(urlPattern)).href;
  if (!toolName(name) || connectionToolNames.includes(toolName(name))) return "Give the task a short plain name, such as Read course syllabus.";
  if (!sameNames(placeholders(urlPattern), inputs.map((input) => input.name))) return "Every {placeholder} in urlPattern needs exactly one input with the same name, and every input needs a placeholder.";
  if (app.tasks.some((task) => toolName(task.name) === toolName(name))) return `${app.name} already has a task named ${name}. Use that tool in a new chat, or choose another name.`;
  if (app.tasks.some((task) => task.requests.some((request) => new URL(withoutPlaceholderNames(request.urlPattern), app.url).href === address))) return `${app.name} already has a task for ${urlPattern}. Use that tool in a new chat.`;
}

export function saveTask(app: Website, pageTask: PageTask) {
  return Sentry.startSpan({ name: "task.save", attributes: { "task.name": pageTask.name } }, async () => {
    const reason = rejectionReason(app, pageTask);
    if (reason) throw new Error(reason);
    const { urlPattern, ...capability } = pageTask;
    await updateStoredApp(app.id, { tasks: [...app.tasks, { ...capability, requests: [{ method: "GET", urlPattern }], id: crypto.randomUUID() }] });
    Sentry.logger.info("Task saved", { appId: app.id, task: pageTask.name });
    return `Saved ${pageTask.name} as a task for ${app.name}. It appears as its own tool, ${toolName(pageTask.name)}, in a new ChatGPT chat; in this chat, keep using read_page.`;
  });
}
