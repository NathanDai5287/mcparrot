import type { CapturedRequest } from "../../../lib/capabilities";

const geminiUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent";
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

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return Response.json({ error: "Discovery is not set up. Add GEMINI_API_KEY to the server environment." }, { status: 500 });
  const { websiteUrl, requests } = await request.json() as { websiteUrl: string; requests: CapturedRequest[] };
  if (!requests?.length) return Response.json({ error: "Explore the website first so there are requests to read." }, { status: 400 });

  const response = await fetch(geminiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-goog-api-key": apiKey },
    body: JSON.stringify({
      contents: [{ parts: [{ text: discoveryPrompt(websiteUrl, requests) }] }],
      generationConfig: { responseMimeType: "application/json", responseSchema: capabilitiesSchema },
    }),
  });
  if (!response.ok) return Response.json({ error: `Gemini could not read the requests (error ${response.status}). Try again.` }, { status: 502 });
  const result = await response.json();
  const answer: string | undefined = result.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!answer) return Response.json({ error: "Gemini returned no capabilities. Explore more pages, then try again." }, { status: 502 });
  return Response.json(JSON.parse(answer));
}
