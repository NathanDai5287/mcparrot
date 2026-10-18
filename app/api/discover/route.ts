import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Agent, CursorAgentError } from "@cursor/sdk";
import type { CapturedRequest } from "../../../lib/capabilities";

export const runtime = "nodejs";
export const maxDuration = 60;

function discoveryPrompt(websiteUrl: string, requests: CapturedRequest[]) {
  return `A person browsed ${websiteUrl} while we recorded the data requests the page made.
Each request below has its method, URL, status, response content type, and a short, truncated sample of the response.
List the distinct, useful things an assistant could do for this person with these requests, such as listing, searching, or reading information.
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

export async function POST(request: Request) {
  const apiKey = process.env.CURSOR_API_KEY;
  if (!apiKey) return Response.json({ error: "Discovery is not set up. Add CURSOR_API_KEY to the server environment." }, { status: 500 });
  const { websiteUrl, requests } = await request.json() as { websiteUrl: string; requests: CapturedRequest[] };
  if (!requests?.length) return Response.json({ error: "Explore the website first so there are requests to read." }, { status: 400 });

  try {
    const result = await Agent.prompt(discoveryPrompt(websiteUrl, requests), {
      apiKey,
      model: { id: "composer-2.5", params: [{ id: "fast", value: "true" }] },
      local: { cwd: await mkdtemp(join(tmpdir(), "discover-")) },
    });
    if (result.status !== "finished" || !result.result) return Response.json({ error: "Composer returned no capabilities. Explore more pages, then try again." }, { status: 502 });
    return Response.json(parseJsonReply(result.result));
  } catch (error) {
    if (!(error instanceof CursorAgentError)) throw error;
    return Response.json({ error: `Composer could not read the requests (${error.message}). Try again.` }, { status: 502 });
  }
}
