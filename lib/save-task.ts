import * as Sentry from "@sentry/nextjs";
import type { Capability, DiscoveredCapability, Task, TaskRequest, Website } from "./capabilities";
import { addressOnWebsite } from "./run-task";
import { bodyPlaceholderPattern, isAllowedRequest, paymentRefusal, requestPlaceholders } from "./task-request";
import { changeApp } from "./workspace";

export type PageTask = Omit<Capability, "requests"> & { method?: "GET" | "POST"; urlPattern: string; bodyPattern?: string; contentType?: string };

export const connectionToolNames = ["read_page", "save_task", "submit_verification_code", "prepare_order", "check_order", "place_order", "cancel_order"];

export function toolName(taskName: string) {
  return taskName.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 64);
}

export function taskNameProblem(taskName: string) {
  const name = toolName(taskName);
  if (!name || connectionToolNames.includes(name)) return "Give the tool a short plain name, such as Read course syllabus.";
}

const sameNames = (first: string[], second: string[]) => first.length === second.length && [...first].sort().join("\n") === [...second].sort().join("\n");

const requestKey = (website: string, { method, urlPattern, bodyPattern = "" }: TaskRequest) => `${method.toUpperCase()} ${new URL(urlPattern.replace(/\{[^}]+\}/g, "{}"), website).href} ${bodyPattern.replace(bodyPlaceholderPattern, "{}")}`;

function duplicateOf(website: string, tasks: Task[], capability: Capability) {
  const keys = capability.requests.map((request) => requestKey(website, request));
  return tasks.find((task) => toolName(task.name) === toolName(capability.name)
    || task.requests.some((request) => keys.includes(requestKey(website, request))));
}

const withNewTasks = (app: Website, capabilities: Capability[]) => ({
  ...app,
  tasks: capabilities.reduce((tasks, capability) => taskNameProblem(capability.name) || duplicateOf(app.url, tasks, capability) ? tasks : [...tasks, { ...capability, id: crypto.randomUUID() }], app.tasks),
});

export const addTasks = (appId: string, capabilities: Capability[]) => changeApp(appId, (app) => withNewTasks(app, capabilities));

function withReplacedTask(app: Website, taskId: string, capability: Capability) {
  const otherTasks = app.tasks.filter((task) => task.id !== taskId);
  if (otherTasks.length === app.tasks.length || taskNameProblem(capability.name) || duplicateOf(app.url, otherTasks, capability)) return app;
  return { ...app, tasks: app.tasks.map((task) => task.id === taskId ? { ...capability, id: taskId } : task) };
}

export const replaceTask = (appId: string, taskId: string, capability: Capability) => changeApp(appId, (app) => withReplacedTask(app, taskId, capability));

const taskContent = ({ name, description, requests, inputs, returns }: Capability) => JSON.stringify({ name, description, requests, inputs, returns });

export function unsavedCapabilities(app: Website, capabilities: DiscoveredCapability[]): DiscoveredCapability[] {
  return capabilities.flatMap(({ updatesTaskId, ...capability }) => {
    const updatedTask = app.tasks.find((task) => task.id === updatesTaskId);
    if (updatedTask) return taskContent(updatedTask) === taskContent(capability) ? [] : [{ ...capability, updatesTaskId }];
    return duplicateOf(app.url, app.tasks, capability) ? [] : [capability];
  });
}

function rejectionReason(app: Website, capability: Capability) {
  const [request] = capability.requests;
  addressOnWebsite(app, request.urlPattern.replace(/\{[^}]+\}/g, "{}"));
  const nameProblem = taskNameProblem(capability.name);
  if (nameProblem) return nameProblem;
  if (request.method === "GET" && request.bodyPattern !== undefined) return "Only a POST request can have a bodyPattern.";
  if (!isAllowedRequest(request)) return paymentRefusal;
  if (!sameNames([...new Set(requestPlaceholders(request))], capability.inputs.map((input) => input.name))) return "Every {placeholder} in urlPattern and bodyPattern needs exactly one input with the same name, and every input needs a placeholder.";
  const duplicate = duplicateOf(app.url, app.tasks, capability);
  if (duplicate) return `${app.name} already has a tool with this name or page, ${duplicate.name}. Use that tool in a new chat, or choose another name and page.`;
}

export function saveTask(app: Website, { method = "GET", urlPattern, bodyPattern, contentType, ...pageTask }: PageTask) {
  return Sentry.startSpan({ name: "task.save", attributes: { "task.name": pageTask.name } }, async () => {
    const capability = { ...pageTask, requests: [{ method, urlPattern, ...(bodyPattern === undefined ? {} : { bodyPattern }), ...(contentType === undefined ? {} : { contentType }) }] };
    let found = false;
    await changeApp(app.id, (storedApp) => {
      found = true;
      const reason = rejectionReason(storedApp, capability);
      if (reason) throw new Error(reason);
      return withNewTasks(storedApp, [capability]);
    });
    if (!found) throw new Error("This app no longer exists in MCParrot.");
    Sentry.logger.info("Task saved", { appId: app.id, task: pageTask.name });
    return `Saved ${pageTask.name} as a tool for ${app.name}. It appears as ${toolName(pageTask.name)} in a new ChatGPT chat; in this chat, keep using read_page.`;
  });
}
