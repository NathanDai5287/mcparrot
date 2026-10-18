import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import * as Sentry from "@sentry/nextjs";
import { z } from "zod";
import { isOwner } from "../../../../lib/account";
import type { Task, Website } from "../../../../lib/capabilities";
import { connectionAllowed } from "../../../../lib/connection";
import { cancelOrder, checkOrder, noOrderMessage, orderIdSchema, orderRequestSchema, placeOrder, prepareOrder, readLinkStatus, type LinkStatus, type OrderView } from "../../../../lib/order";
import { isReadingTask, readPage, runTask } from "../../../../lib/run-task";
import { connectionToolNames, saveTask, toolName } from "../../../../lib/save-task";
import { readSigningIn, submitVerificationCode } from "../../../../lib/sign-in";
import { findApp } from "../../../../lib/workspace";

export const runtime = "nodejs";
export const maxDuration = 300;

function inputSchema(task: Task) {
  return Object.fromEntries(task.inputs.map((input) => [input.name, z.string().optional().describe(`${input.description} For example, ${input.example}.`)]));
}

const textResult = (text: string) => ({ content: [{ type: "text" as const, text }] });

const orderStatusText: Record<OrderView["status"], string> = {
  preparing: "Browser Use is building the cart. Call check_order again in about 30 seconds.",
  ready: "The cart is at checkout and nothing has been paid. Show the user every item, the fees, the tip, the total, the delivery address, and the delivery estimate. Call place_order only after the user clearly approves this exact total.",
  placing: "Browser Use is checking the total and paying with Pay with Link. The user approves the payment in the Link app on their phone. Call check_order again in about 30 seconds.",
  placed: "The website confirmed the order.",
  failed: "The order did not finish.",
  cancelled: "The order was cancelled.",
};

function orderText(order: OrderView | null) {
  if (!order) return "No order is in progress for this app.";
  return [`Order ${order.orderId}: ${orderStatusText[order.status]}`, order.problem, order.confirmation && `Confirmation: ${order.confirmation}`, order.cart && `Cart: ${JSON.stringify(order.cart)}`].filter(Boolean).join("\n");
}

function linkText(link: LinkStatus | undefined) {
  if (!link) return "MCParrot could not read the Browser Use Pay with Link status.";
  if (!link.isConnected) return "Browser Use Pay with Link is not connected.";
  if (link.mode === "test") return "Browser Use Pay with Link is connected in test mode.";
  return "Browser Use Pay with Link is in live mode, which MCParrot blocks, so orders cannot be placed.";
}

function registerOrderTools(server: McpServer, app: Website, limitUsd: number) {
  const orderIdInput = { orderId: orderIdSchema.describe("The order ID that prepare_order returned.") };
  server.registerTool("prepare_order", {
    title: `Prepare an order on ${app.name}`,
    description: `Start a Browser Use agent that builds a cart on ${app.name} from the user's request and stops at checkout without paying. It returns at once with an order ID; call check_order until the cart is ready. Orders are limited to $${limitUsd} each.`,
    inputSchema: { request: orderRequestSchema.describe("What to order, such as one large pepperoni pizza from a named restaurant.") },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  }, async ({ request }) => textResult(orderText(await prepareOrder(app, request))));
  server.registerTool("check_order", {
    title: `Check an order on ${app.name}`,
    description: "Return the order's progress, its cart and total when it is ready, or its confirmation after payment, and the Pay with Link status.",
    inputSchema: orderIdInput,
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, async ({ orderId }) => {
    const [order, link] = await Promise.all([checkOrder(app), readLinkStatus()]);
    if (order && order.orderId !== orderId) throw new Error(noOrderMessage);
    return textResult(`${orderText(order)}\n${linkText(link)}`);
  });
  server.registerTool("place_order", {
    title: `Place an order on ${app.name}`,
    description: `Pay for a prepared order with Browser Use Pay with Link. Call it only after the user explicitly approves the exact cart and total that check_order showed. MCParrot refuses unless Link is in test mode, the total is at most $${limitUsd}, and the checkout total still matches the approved total. The user also approves the payment in the Link app. Then call check_order for the confirmation.`,
    inputSchema: orderIdInput,
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  }, async ({ orderId }) => textResult(orderText(await placeOrder(app, orderId))));
  server.registerTool("cancel_order", {
    title: `Cancel an order on ${app.name}`,
    description: "Stop the order's Browser Use agent and close its browser. The cart can stay in the website account.",
    inputSchema: orderIdInput,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, async ({ orderId }) => textResult(orderText(await cancelOrder(app, orderId))));
}

function appServer(app: Website, orderLimitUsd?: number) {
  const server = Sentry.wrapMcpServerWithSentry(new McpServer({ name: `MCParrot ${app.name}`, version: "1.0.0" }), { recordInputs: false, recordOutputs: false });
  const tasks = app.tasks.filter(isReadingTask);
  const usedNames = new Set(connectionToolNames);
  const names = new Map<Task, string>();
  for (const task of tasks) {
    const name = toolName(task.name);
    if (!name || usedNames.has(name)) continue;
    names.set(task, name);
    usedNames.add(name);
  }
  for (const task of tasks.filter((candidate) => !names.has(candidate))) {
    const baseName = toolName(task.name);
    const fallbacks = [baseName ? `${baseName.slice(0, 55)}_${task.id.slice(0, 8)}` : `task_${task.id.slice(0, 8)}`, `task_${task.id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 59)}`];
    const name = fallbacks.find((candidate) => !usedNames.has(candidate));
    Sentry.logger.warn(name ? "Task tool renamed" : "Task tool skipped", { appId: app.id, taskId: task.id, toolName: name ?? fallbacks[0] });
    if (!name) continue;
    names.set(task, name);
    usedNames.add(name);
  }
  for (const task of tasks) {
    const name = names.get(task);
    if (!name) continue;
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
    title: `Save a page as a tool for ${app.name}`,
    description: `Save a new tool for ${app.name} that reads a page. After read_page returns useful content for a kind of request the user may repeat, save that page without asking first. Replace values that change, such as a course ID, with {placeholders} in urlPattern, and give one input for each placeholder. The tool appears in a new chat.`,
    inputSchema: {
      name: z.string().describe("A short plain tool name, such as Read course syllabus."),
      description: z.string().describe("What the tool does, in one plain sentence."),
      urlPattern: z.string().describe(`A full address on ${website} or a path, with {placeholders} for values that change, such as /courses/{courseId}/assignments/syllabus.`),
      inputs: z.array(z.object({ name: z.string(), description: z.string(), example: z.string() })).describe("One input for each placeholder, with the value from the page you read as the example."),
      returns: z.string().describe("What the tool returns, in a few words."),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async (pageTask) => textResult(await saveTask(app, pageTask)));
  server.registerTool("submit_verification_code", {
    title: "Submit verification code",
    description: `Finish signing in to ${app.name} with the text-message code that the user received. Call it only after a tool result says that a code was sent.`,
    inputSchema: { code: z.string().regex(/^\d+$/).describe("The digits from the text message, exactly as the user typed them.") },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  }, async ({ code }) => textResult(await submitVerificationCode(app, code)));
  if (orderLimitUsd) registerOrderTools(server, app, orderLimitUsd);
  return server;
}

async function POST(request: Request, { params }: RouteContext<"/mcp/apps/[appId]">) {
  const { appId } = await params;
  Sentry.setTag("app.id", appId);
  const found = await findApp(appId);
  if (!found) return Response.json({ error: "This MCParrot app does not exist." }, { status: 404 });
  if (!await connectionAllowed(request, found.app, found.ownerId)) return Response.json({ error: "This connection link is not valid. Copy a new link from the app page in MCParrot." }, { status: 401 });
  const orderLimitUsd = found.app.ordering?.enabled && await isOwner(found.ownerId) ? found.app.ordering.limitUsd : undefined;
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await appServer(found.app, orderLimitUsd).connect(transport);
  return transport.handleRequest(request);
}

const methodNotAllowed = () => Response.json(
  { jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null },
  { status: 405, headers: { Allow: "POST" } },
);

export { POST, methodNotAllowed as GET, methodNotAllowed as DELETE };
