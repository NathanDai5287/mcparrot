import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Agent, CursorAgentError } from "@cursor/sdk";
import * as Sentry from "@sentry/nextjs";
import type { CapturedRequest } from "../../../lib/capabilities";

export const runtime = "nodejs";
export const maxDuration = 60;

function discoveryPrompt(websiteUrl: string, requests: CapturedRequest[]) {
  return `A person browsed ${websiteUrl} while we recorded the pages they opened and the data requests those pages made.
Each request below has its method, URL, status, response content type, and a short, truncated sample of the response.
Requests with "kind":"page" are whole pages the person opened, and their sample is the start of the page's visible text; a task that uses a page request returns that page's full text.
List the distinct, useful things an assistant could do for this person with these requests, such as listing, searching, or reading information.
Suggest page-reading tasks for pages whose text is useful, such as "Read course syllabus" with a {courseId} input, especially when no data request returns the same information.
Ignore analytics, configuration, feature flags, and authentication requests.
For each capability, give a short plain-language task name such as "List assignments", a plain-language description, the requests it uses (method and URL pattern, with {placeholders} for values that change), the inputs a person could change (name, description, and an example taken from the requests), and what it returns.
Do not use any tools. Reply with ONLY JSON in this shape and no other text:
{"capabilities":[{"name":"","description":"","requests":[{"method":"","urlPattern":""}],"inputs":[{"name":"","description":"","example":""}],"returns":""}]}

Requests:
${JSON.stringify(requests)}`;
}

function parseJsonReply(reply: string) {
  return JSON.parse(reply.trim().replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, ""));
}

function askComposer(prompt: string, apiKey: string, requestCount: number) {
  return Sentry.startSpan({
    name: "discover.composer",
    op: "gen_ai.invoke_agent",
    attributes: {
      "gen_ai.operation.name": "invoke_agent",
      "gen_ai.agent.name": "MCParrot discovery",
      "gen_ai.request.model": "composer-2.5-fast",
      "discover.request_count": requestCount,
    },
  }, async (span) => {
    const result = await Agent.prompt(prompt, {
      apiKey,
      model: { id: "composer-2.5", params: [{ id: "fast", value: "true" }] },
      local: { cwd: await mkdtemp(join(tmpdir(), "discover-")) },
    });
    span.setAttributes({ "discover.status": result.status, "gen_ai.response.size": result.result?.length ?? 0 });
    return result;
  });
}

export async function POST(request: Request) {
  const apiKey = process.env.CURSOR_API_KEY;
  if (!apiKey) return Response.json({ error: "Discovery is not set up. Add CURSOR_API_KEY to the server environment." }, { status: 500 });
  const { websiteUrl, requests } = await request.json() as { websiteUrl: string; requests: CapturedRequest[] };
  if (!requests?.length) return Response.json({ error: "Explore the website first so there are requests to read." }, { status: 400 });

  Sentry.logger.info("Discovery started", { requestCount: requests.length });
  try {
    const result = await askComposer(discoveryPrompt(websiteUrl, requests), apiKey, requests.length);
    if (result.status !== "finished" || !result.result) {
      Sentry.logger.warn("Discovery returned no capabilities", { status: result.status });
      return Response.json({ error: "Composer returned no capabilities. Explore more pages, then try again." }, { status: 502 });
    }
    const discovery = parseJsonReply(result.result);
    Sentry.logger.info("Discovery finished", { capabilityCount: discovery.capabilities?.length ?? 0 });
    return Response.json(discovery);
  } catch (error) {
    if (!(error instanceof CursorAgentError)) throw error;
    Sentry.captureException(error);
    return Response.json({ error: `Composer could not read the requests (${error.message}). Try again.` }, { status: 502 });
  }
}
