import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import * as Sentry from "@sentry/nextjs";
import { z } from "zod";
import type { Task, Website } from "../../../../lib/capabilities";
import { isReadingTask, runTask } from "../../../../lib/run-task";
import { readWorkspace } from "../../../../lib/workspace";

export const runtime = "nodejs";
export const maxDuration = 60;

function toolName(taskName: string) {
  return taskName.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 64);
}

function inputSchema(task: Task) {
  return Object.fromEntries(task.inputs.map((input) => [input.name, z.string().optional().describe(`${input.description} For example, ${input.example}.`)]));
}

function appServer(app: Website) {
  const server = Sentry.wrapMcpServerWithSentry(new McpServer({ name: `MCParrot ${app.name}`, version: "1.0.0" }), { recordInputs: true, recordOutputs: false });
  for (const task of app.tasks.filter(isReadingTask)) {
    server.registerTool(toolName(task.name), {
      title: task.name,
      description: `${task.description} Returns ${task.returns}.`,
      inputSchema: inputSchema(task),
      annotations: { readOnlyHint: true },
    }, async (inputs) => ({ content: [{ type: "text", text: await runTask(app, task, inputs) }] }));
  }
  return server;
}

async function handle(request: Request, { params }: RouteContext<"/mcp/apps/[appId]">) {
  const { appId } = await params;
  Sentry.setTag("app.id", appId);
  const app = (await readWorkspace())?.find((candidate) => candidate.id === appId);
  if (!app) return Response.json({ error: "This MCParrot app does not exist." }, { status: 404 });
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await appServer(app).connect(transport);
  return transport.handleRequest(request);
}

export { handle as GET, handle as POST, handle as DELETE };
