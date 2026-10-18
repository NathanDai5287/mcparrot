import type { CapturedRequest } from "../../../lib/capabilities";

export const maxDuration = 60;

const geminiAttempts = [
  { model: "gemini-flash-latest", waitMs: 0 },
  { model: "gemini-flash-latest", waitMs: 1000 },
  { model: "gemini-flash-latest", waitMs: 2000 },
  { model: "gemini-flash-lite-latest", waitMs: 0 },
];
const overloadedStatuses = [429, 503];
const text = { type: "STRING" };
const capabilitiesSchema = {
  type: "OBJECT",
  required: ["capabilities"],
  properties: {
    capabilities: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        required: ["name", "description", "requests", "inputs", "returns"],
        properties: {
          name: text,
          description: text,
          requests: { type: "ARRAY", items: { type: "OBJECT", required: ["method", "urlPattern"], properties: { method: text, urlPattern: text } } },
          inputs: { type: "ARRAY", items: { type: "OBJECT", required: ["name", "description", "example"], properties: { name: text, description: text, example: text } } },
          returns: text,
        },
      },
    },
  },
};

function discoveryPrompt(websiteUrl: string, requests: CapturedRequest[]) {
  return `A person browsed ${websiteUrl} while we recorded the data requests the page made.
Each request below has its method, URL, status, response content type, and a short, truncated sample of the response.
List the distinct, useful things an assistant could do for this person with these requests, such as listing, searching, or reading information.
Ignore analytics, configuration, feature flags, and authentication requests.
For each capability, give a short plain-language task name such as "List assignments", a plain-language description, the requests it uses (method and URL pattern, with {placeholders} for values that change), the inputs a person could change (name, description, and an example taken from the requests), and what it returns.

Requests:
${JSON.stringify(requests)}`;
}

async function askGemini(apiKey: string, body: string) {
  let response = new Response(null, { status: 503 });
  for (const { model, waitMs } of geminiAttempts) {
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-goog-api-key": apiKey },
      body,
    });
    if (!overloadedStatuses.includes(response.status)) return response;
  }
  return response;
}

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return Response.json({ error: "Discovery is not set up. Add GEMINI_API_KEY to the server environment." }, { status: 500 });
  const { websiteUrl, requests } = await request.json() as { websiteUrl: string; requests: CapturedRequest[] };
  if (!requests?.length) return Response.json({ error: "Explore the website first so there are requests to read." }, { status: 400 });

  const response = await askGemini(apiKey, JSON.stringify({
    contents: [{ parts: [{ text: discoveryPrompt(websiteUrl, requests) }] }],
    generationConfig: { responseMimeType: "application/json", responseSchema: capabilitiesSchema },
  }));
  if (!response.ok) return Response.json({ error: `Gemini could not read the requests (error ${response.status}). Try again.` }, { status: 502 });
  const result = await response.json();
  const answer: string | undefined = result.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!answer) return Response.json({ error: "Gemini returned no capabilities. Explore more pages, then try again." }, { status: 502 });
  return Response.json(JSON.parse(answer));
}
