import * as Sentry from "@sentry/nextjs";
import { capabilitySchema, type Capability, type DiscoveredCapability, type TaskRequest, type Website } from "./capabilities";
import { addressOnWebsite } from "./run-task";
import { bodyPlaceholderPattern, isAllowedRequest, paymentRefusal, requestPlaceholders, usesOnlyEarlierSteps } from "./task-request";
import { changeApp } from "./workspace";

type PageRequest = { method?: "GET" | "POST"; urlPattern: string; bodyPattern?: string; contentType?: string };

type PageTask = Omit<Capability, "requests"> & PageRequest & { earlierRequests?: PageRequest[] };

export const connectionToolNames = ["read_page", "view_image", "save_task", "submit_verification_code", "prepare_order", "check_order", "place_order", "cancel_order"];

export function toolName(taskName: string) {
  return taskName.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 64);
}

function taskNameProblem(taskName: string) {
  const name = toolName(taskName);
  if (!name || connectionToolNames.includes(name)) return "Give the tool a short plain name, such as Read course syllabus.";
}

const sameNames = (first: string[], second: string[]) => first.length === second.length && [...first].sort().join("\n") === [...second].sort().join("\n");

const placeholderFreeAddress = (urlPattern: string) => urlPattern.replace(/\{[^}]+\}/g, "{}");

function requestAddress(website: string, urlPattern: string) {
  const address = placeholderFreeAddress(urlPattern);
  return URL.canParse(address, website) ? new URL(address, website).href : address;
}

const requestKey = (website: string, { method, urlPattern, bodyPattern = "" }: TaskRequest) => `${method.toUpperCase()} ${requestAddress(website, urlPattern)} ${bodyPattern.replace(bodyPlaceholderPattern, "{}")}`;

const requestsKey = (website: string, requests: TaskRequest[]) => requests.map((request) => requestKey(website, request)).join("\n");

function duplicateOf<T extends Capability>(website: string, tasks: T[], capability: Capability) {
  const key = requestsKey(website, capability.requests);
  return tasks.find((task) => toolName(task.name) === toolName(capability.name) || requestsKey(website, task.requests) === key);
}

function addressProblem(app: Website, urlPattern: string) {
  const address = placeholderFreeAddress(urlPattern);
  if (!URL.canParse(address, app.url)) return "Give each urlPattern as a full address on the website or a path such as /courses.";
  try {
    addressOnWebsite(app, address);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

const redactionMarker = /\[redacted\]|%5Bredacted%5D|[?&][^=&#]*=redacted(?=[&#]|$)|\/redacted(?=[/?#]|$)/i;
const bodyRedactionMarker = /\[redacted\]|"redacted"|=redacted\b|Bearer redacted/;

const keepsRedactionMarker = ({ urlPattern, bodyPattern = "" }: TaskRequest) => redactionMarker.test(urlPattern) || bodyRedactionMarker.test(bodyPattern);

function requestProblem(app: Website, capability: Capability) {
  const parsed = capabilitySchema.safeParse(capability);
  if (!parsed.success) return `The tool is too long or incomplete: ${parsed.error.issues.map((issue) => `${issue.path.join(".") || "tool"}: ${issue.message}`).join("; ")}.`;
  for (const request of capability.requests) {
    const problem = addressProblem(app, request.urlPattern);
    if (problem) return problem;
  }
  const nameProblem = taskNameProblem(capability.name);
  if (nameProblem) return nameProblem;
  if (capability.requests.some((request) => request.method === "GET" && request.bodyPattern !== undefined)) return "Only a POST request can have a bodyPattern.";
  if (!capability.requests.every(isAllowedRequest)) return paymentRefusal;
  if (capability.requests.some(keepsRedactionMarker)) return "A request still contains a redacted value. Turn it into a {placeholder} input instead.";
  if (!usesOnlyEarlierSteps(capability.requests)) return "A {stepN.path} placeholder can only use the response of an earlier request in this tool, where step1 is the first request.";
  if (!sameNames([...new Set(capability.requests.flatMap(requestPlaceholders))], capability.inputs.map((input) => input.name))) return "Every {placeholder} in urlPattern and bodyPattern, other than {stepN.path} placeholders, needs exactly one input with the same name, and every input needs a placeholder.";
}

const withNewTasks = (app: Website, capabilities: Capability[]) => ({
  ...app,
  tasks: capabilities.reduce((tasks, capability) => requestProblem(app, capability) || duplicateOf(app.url, tasks, capability) ? tasks : [...tasks, { ...capability, id: crypto.randomUUID() }], app.tasks),
});

export const addTasks = (appId: string, capabilities: Capability[]) => changeApp(appId, (app) => withNewTasks(app, capabilities));

function withReplacedTask(app: Website, taskId: string, capability: Capability) {
  const otherTasks = app.tasks.filter((task) => task.id !== taskId);
  if (otherTasks.length === app.tasks.length || requestProblem(app, capability) || duplicateOf(app.url, otherTasks, capability)) return app;
  return { ...app, tasks: app.tasks.map((task) => task.id === taskId ? { ...capability, id: taskId } : task) };
}

export const replaceTask = (appId: string, taskId: string, capability: Capability) => changeApp(appId, (app) => withReplacedTask(app, taskId, capability));

const taskContent = ({ name, description, requests, inputs, returns, keepFields }: Capability) => JSON.stringify({ name, description, requests, inputs, returns, keepFields });

export function unsavedCapabilities(app: Website, capabilities: DiscoveredCapability[]): DiscoveredCapability[] {
  return capabilities.reduce<DiscoveredCapability[]>((kept, { updatesTaskId, ...capability }) => {
    const updatedTask = app.tasks.find((task) => task.id === updatesTaskId);
    if (requestProblem(app, capability) || duplicateOf(app.url, kept, capability)) return kept;
    if (updatedTask && taskContent(updatedTask) === taskContent(capability)) return kept;
    if (duplicateOf(app.url, app.tasks.filter((task) => task !== updatedTask), capability)) return kept;
    return [...kept, updatedTask ? { ...capability, updatesTaskId } : capability];
  }, []);
}

function rejectionReason(app: Website, capability: Capability) {
  const problem = requestProblem(app, capability);
  if (problem) return problem;
  const duplicate = duplicateOf(app.url, app.tasks, capability);
  if (duplicate) return `${app.name} already has a tool with this name or page, ${duplicate.name}. Use that tool in a new chat, or choose another name and page.`;
}

const pageRequest = ({ method = "GET", urlPattern, bodyPattern, contentType }: PageRequest): TaskRequest => ({ method, urlPattern, ...(bodyPattern === undefined ? {} : { bodyPattern }), ...(contentType === undefined ? {} : { contentType }) });

export function saveTask(app: Website, { method, urlPattern, bodyPattern, contentType, earlierRequests = [], ...pageTask }: PageTask) {
  return Sentry.startSpan({ name: "task.save", attributes: { "task.name": pageTask.name } }, async () => {
    const capability = { ...pageTask, requests: [...earlierRequests, { method, urlPattern, bodyPattern, contentType }].map(pageRequest) };
    await changeApp(app.id, (storedApp) => {
      const reason = rejectionReason(storedApp, capability);
      if (reason) throw new Error(reason);
      return withNewTasks(storedApp, [capability]);
    });
    Sentry.logger.info("Task saved", { appId: app.id, task: pageTask.name });
    return `Saved ${pageTask.name} as a tool for ${app.name}. It appears as ${toolName(pageTask.name)} in a new ChatGPT chat; in this chat, keep using read_page.`;
  });
}
