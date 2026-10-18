import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import * as Sentry from "@sentry/nextjs";
import { z } from "zod";
import type { Task, Website } from "../../../../lib/capabilities";
import { isReadingTask, readPage, runTask } from "../../../../lib/run-task";
import { connectionToolNames, saveTask, toolName } from "../../../../lib/save-task";
import { readSigningIn, submitVerificationCode } from "../../../../lib/sign-in";
import { readWorkspace } from "../../../../lib/workspace";

export const runtime = "nodejs";
export const maxDuration = 300;

function inputSchema(task: Task) {
  return Object.fromEntries(task.inputs.map((input) => [input.name, z.string().optional().describe(`${input.description} For example, ${input.example}.`)]));
}

const textResult = (text: string) => ({ content: [{ type: "text" as const, text }] });

function appServer(app: Website) {
  const server = Sentry.wrapMcpServerWithSentry(new McpServer({ name: `MCParrot ${app.name}`, version: "1.0.0" }), { recordInputs: false, recordOutputs: false });
  const usedNames = new Set(connectionToolNames);
  for (const task of app.tasks.filter(isReadingTask)) {
    const idSuffix = task.id.slice(0, 8);
    const baseName = toolName(task.name) || `task_${idSuffix}`;
    const name = [baseName, `${baseName.slice(0, 55)}_${idSuffix}`].find((candidate) => !usedNames.has(candidate));
    if (name !== toolName(task.name)) Sentry.logger.warn("Task tool name changed or skipped", { appId: app.id, taskId: task.id, toolName: name ?? null });
    if (!name) continue;
    usedNames.add(name);
    server.registerTool(name, {
      title: task.name,
      description: `${task.description} Returns ${task.returns}.`,
      inputSchema: inputSchema(task),
      annotations: { readOnlyHint: true },
    }, async (inputs) => textResult(await readSigningIn(app, (signedInApp) => runTask(signedInApp, task, inputs))));
  }
  const website = new URL(app.url).origin;
  server.registerTool("read_page", {
    title: `Read a page on ${app.name}`,
    description: `Open any page on ${website} that the signed-in user can see and return its text. Use it for pages that no other tool covers, such as a link that the user shares.`,
    inputSchema: { url: z.string().describe(`A full address on ${website}, or a path such as /courses.`) },
    annotations: { readOnlyHint: true },
  }, async ({ url }) => textResult(await readSigningIn(app, (signedInApp) => readPage(signedInApp, url))));
  server.registerTool("save_task", {
    title: `Save a page as a task for ${app.name}`,
    description: `After read_page returns useful content for a kind of request the user may repeat, save that page as a reading task without asking first. Replace values that change, such as a course ID, with {placeholders} in urlPattern, and give one input for each placeholder. The task becomes its own tool in a new chat.`,
    inputSchema: {
      name: z.string().describe("A short plain task name, such as Read course syllabus."),
      description: z.string().describe("What the task does, in one plain sentence."),
      urlPattern: z.string().describe(`A full address on ${website} or a path, with {placeholders} for values that change, such as /courses/{courseId}/assignments/syllabus.`),
      inputs: z.array(z.object({ name: z.string(), description: z.string(), example: z.string() })).describe("One input for each placeholder, with the value from the page you read as the example."),
      returns: z.string().describe("What the task returns, in a few words."),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async (pageTask) => textResult(await saveTask(app, pageTask)));
  server.registerTool("submit_verification_code", {
    title: "Submit verification code",
    description: `Finish signing in to ${app.name} with the text-message code that the user received. Call it only after a task result says that a code was sent.`,
    inputSchema: { code: z.string().regex(/^\d+$/).describe("The digits from the text message, exactly as the user typed them.") },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  }, async ({ code }) => textResult(await submitVerificationCode(app, code)));
  return server;
}

async function POST(request: Request, { params }: RouteContext<"/mcp/apps/[appId]">) {
  const { appId } = await params;
  Sentry.setTag("app.id", appId);
  const app = (await readWorkspace())?.find((candidate) => candidate.id === appId);
  if (!app) return Response.json({ error: "This MCParrot app does not exist." }, { status: 404 });
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await appServer(app).connect(transport);
  return transport.handleRequest(request);
}

const methodNotAllowed = () => Response.json(
  { jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null },
  { status: 405, headers: { Allow: "POST" } },
);

export { POST, methodNotAllowed as GET, methodNotAllowed as DELETE };
