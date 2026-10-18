import { createMcpHandler, isLegacyRequest, McpServer, WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/server";
import * as Sentry from "@sentry/nextjs";
import { z } from "zod";
import { isOwner } from "../../../../lib/account";
import type { Task, Website } from "../../../../lib/capabilities";
import { connectionAllowed } from "../../../../lib/connection";
import { cancelOrder, checkOrder, noOrderMessage, orderIdSchema, orderWaitMilliseconds, orderRequestSchema, placeOrder, prepareOrder, readLinkStatus, type LinkStatus, type OrderView } from "../../../../lib/order";
import { isRunnableTask, readPage, runTask } from "../../../../lib/run-task";
import { connectionToolNames, saveTask, toolName } from "../../../../lib/save-task";
import { readSigningIn, submitVerificationCode } from "../../../../lib/sign-in";
import { isReadOnlyRequest } from "../../../../lib/task-request";
import { viewImage } from "../../../../lib/view-image";
import { findApp } from "../../../../lib/workspace";

export const runtime = "nodejs";
export const maxDuration = 300;

const fullAnswerInput = z.boolean().optional().describe("Set true only if a field you need is missing from the answer.");

const isIdInput = (name: string) => /(^|_)id$|I[dD]$/.test(name);

function inputSchema(task: Task) {
  return z.object({ ...Object.fromEntries(task.inputs.map((input) => [input.name, isIdInput(input.name) ? z.string().describe(`${input.description} For example, ${input.example}.`) : z.string().optional().describe(`${input.description} Defaults to ${input.example}, the value recorded when the tool was saved.`)])), fullAnswer: fullAnswerInput });
}

const serverInstructions = (app: Website) => `Tools read ${app.name} as the signed-in user. Call the saved tool that matches the request directly; one call returns the whole answer. Use read_page only when no saved tool fits. Answers are already shortened; set fullAnswer only if a needed field is missing. If a result says the site is signed out, tell the user and stop. Run independent tools at once.`;

const readOnlyAnnotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

const textResult = (text: string) => ({ content: [{ type: "text" as const, text }] });

const orderStatusText: Record<OrderView["status"], string> = {
  preparing: "Browser Use is building the cart. Call check_order again now; it waits up to 4 minutes.",
  ready: "The cart is at checkout and nothing has been paid. Show the user every item, the fees, the tip, the total, the delivery address, and the delivery estimate. Call place_order only after the user clearly approves this exact total.",
  placing: "Browser Use is checking the total and paying with Pay with Link. The user approves the payment in the Link app on their phone. Call check_order again now; it waits up to 4 minutes.",
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
  const orderIdInput = z.object({ orderId: orderIdSchema.describe("The order ID that prepare_order returned.") });
  server.registerTool("prepare_order", {
    title: `Prepare an order on ${app.name}`,
    description: `Start a Browser Use agent that builds a cart on ${app.name} from the user's request and stops at checkout without paying. It returns at once with an order ID; call check_order until the cart is ready. Orders are limited to $${limitUsd} each.`,
    inputSchema: z.object({ request: orderRequestSchema.describe("What to order, such as one large pepperoni pizza from a named restaurant.") }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  }, async ({ request }) => textResult(orderText(await prepareOrder(app, request))));
  server.registerTool("check_order", {
    title: `Check an order on ${app.name}`,
    description: "Wait up to 4 minutes for a running order step to finish, then return the order's progress, its cart and total when it is ready, or its confirmation after payment, and the Pay with Link status.",
    inputSchema: orderIdInput,
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, async ({ orderId }) => {
    const [order, link] = await Promise.all([checkOrder(app, orderWaitMilliseconds), readLinkStatus()]);
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
  const server = Sentry.wrapMcpServerWithSentry(new McpServer({ name: `MCParrot ${app.name}`, version: "1.0.0" }, { instructions: serverInstructions(app) }), { recordInputs: false, recordOutputs: false });
  const tasks = app.tasks.filter(isRunnableTask);
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
      annotations: task.requests.every(isReadOnlyRequest) ? readOnlyAnnotations : { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    }, async ({ fullAnswer, ...inputs }) => textResult(await readSigningIn(app, (signedInApp) => runTask(signedInApp, task, inputs, fullAnswer))));
  }
  const website = new URL(app.url).origin;
  server.registerTool("read_page", {
    title: `Read a page on ${app.name}`,
    description: `Open any page on ${website} that the signed-in user can see and return its text. Use only when no other tool covers the page, such as a link that the user shares.`,
    inputSchema: z.object({ url: z.string().describe(`A full address on ${website}, or a path such as /courses.`) }),
    annotations: readOnlyAnnotations,
  }, async ({ url }) => textResult(await readSigningIn(app, (signedInApp) => readPage(signedInApp, url))));
  server.registerTool("view_image", {
    title: `Read an image on ${app.name}`,
    description: "Read the text, numbers, and charts in one image address from an earlier answer. Use only when that image holds the answer.",
    inputSchema: z.object({ url: z.string().describe(`The full image address from an earlier tool answer, such as the src of an <image> or <img> element.`) }),
    annotations: { ...readOnlyAnnotations, openWorldHint: true },
  }, async ({ url }) => textResult((await viewImage(app, url)).text));
  server.registerTool("save_task", {
    title: `Save a tool for ${app.name}`,
    description: `Save a page or one POST request on ${app.name} as a reusable tool for future chats. Call it only when the user asks to save or reuse it. Replace values that change with {placeholders}, one input each.`,
    inputSchema: z.object({
      name: z.string().describe("A short plain tool name, such as Read course syllabus."),
      description: z.string().describe("What the tool does, in one plain sentence."),
      method: z.enum(["GET", "POST"]).optional().describe("GET to read a page, which is the default, or POST to send bodyPattern."),
      urlPattern: z.string().describe(`A full address on ${website} or a path, with {placeholders} for values that change, such as /courses/{courseId}/assignments/syllabus.`),
      bodyPattern: z.string().optional().describe("Only for POST: the request body, usually JSON, with {placeholders} inside string values, such as {\"query\":\"…\",\"variables\":{\"search\":\"{search}\"}}."),
      contentType: z.string().optional().describe("Only for POST: the body's content type. It defaults to application/json."),
      earlierRequests: z.array(z.object({ method: z.enum(["GET", "POST"]).optional(), urlPattern: z.string(), bodyPattern: z.string().optional(), contentType: z.string().optional() })).max(9).optional().describe("Optional requests that run first as step1, step2, and so on; use {step1.cart.id} for a value from one."),
      inputs: z.array(z.object({ name: z.string(), description: z.string(), example: z.string() })).describe("One input for each placeholder other than {stepN.path} placeholders, with the value from the page you read as the example."),
      returns: z.string().describe("What the tool returns, in a few words."),
      keepFields: z.array(z.string()).max(50).optional().describe("Optional JSON paths the answer keeps, such as threads[].title."),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async (pageTask) => textResult(await saveTask(app, pageTask)));
  server.registerTool("submit_verification_code", {
    title: "Submit verification code",
    description: `Finish signing in to ${app.name} with the text-message code that the user received. Call it only after a tool result says that a code was sent.`,
    inputSchema: z.object({ code: z.string().regex(/^\d+$/).describe("The digits from the text message, exactly as the user typed them.") }),
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
  const server = () => appServer(found.app, orderLimitUsd);
  if (!await isLegacyRequest(request)) return createMcpHandler(server, { legacy: "reject" }).fetch(request);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server().connect(transport);
  return transport.handleRequest(request);
}

const methodNotAllowed = () => Response.json(
  { jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null },
  { status: 405, headers: { Allow: "POST" } },
);

export { POST, methodNotAllowed as GET, methodNotAllowed as DELETE };
