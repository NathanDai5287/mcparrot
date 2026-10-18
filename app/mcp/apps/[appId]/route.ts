import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import * as Sentry from "@sentry/nextjs";
import { z } from "zod";
import type { Task, Website } from "../../../../lib/capabilities";
import { isReadingTask, readPage, runTask } from "../../../../lib/run-task";
import { readSigningIn, submitVerificationCode } from "../../../../lib/sign-in";
import { readWorkspace } from "../../../../lib/workspace";

export const runtime = "nodejs";
export const maxDuration = 300;

function toolName(taskName: string) {
  return taskName.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 64);
}

function inputSchema(task: Task) {
  return Object.fromEntries(task.inputs.map((input) => [input.name, z.string().optional().describe(`${input.description} For example, ${input.example}.`)]));
}

const textResult = (text: string) => ({ content: [{ type: "text" as const, text }] });

function appServer(app: Website) {
  const server = Sentry.wrapMcpServerWithSentry(new McpServer({ name: `MCParrot ${app.name}`, version: "1.0.0" }), { recordInputs: false, recordOutputs: false });
  for (const task of app.tasks.filter(isReadingTask)) {
    server.registerTool(toolName(task.name), {
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
  server.registerTool("submit_verification_code", {
    title: "Submit verification code",
    description: `Finish signing in to ${app.name} with the text-message code that the user received. Call it only after a task result says that a code was sent.`,
    inputSchema: { code: z.string().regex(/^\d+$/).describe("The digits from the text message, exactly as the user typed them.") },
  }, async ({ code }) => textResult(await submitVerificationCode(app, code)));
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
