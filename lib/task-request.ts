import type { TaskRequest } from "./capabilities";

export const urlPlaceholderPattern = /\{([^}]+)\}/g;
export const bodyPlaceholderPattern = /\{([A-Za-z_]\w*|step\d+(?:\.[\w-]+)+)\}/g;
export const stepPlaceholderPattern = /^step(\d+)\.(.+)$/;
const paymentWords = /\b(check ?out|payments?|pay|purchases?|place order|create order|submit order|order create)\b/;
export const paymentRefusal = "MCParrot refuses tool requests that look like checkout or payment, so a tool can never place an order. Orders go only through the Pay with Link ordering tools.";

const replayedHeaderNames = ["accept", "apollographql-client-name", "apollographql-client-version", "x-apollo-operation-name", "x-channel-id", "x-experience-id", "x-requested-with"];

export const replayedHeaders = (headers: Record<string, string> = {}) => Object.fromEntries(Object.entries(headers).filter(([name]) => replayedHeaderNames.includes(name.toLowerCase())));

const allPlaceholders = ({ urlPattern, bodyPattern = "" }: TaskRequest) => [...urlPattern.matchAll(urlPlaceholderPattern), ...bodyPattern.matchAll(bodyPlaceholderPattern)].map((match) => match[1]);

export const requestPlaceholders = (request: TaskRequest) => allPlaceholders(request).filter((name) => !stepPlaceholderPattern.test(name));

export const usesOnlyEarlierSteps = (requests: TaskRequest[]) => requests.every((request, index) => allPlaceholders(request).every((name) => {
  const step = name.match(stepPlaceholderPattern)?.[1];
  return step === undefined || (Number(step) >= 1 && Number(step) <= index);
}));

export function isOnWebsite(address: string | URL, website: string) {
  const { protocol, hostname, port } = new URL(address);
  const site = new URL(website);
  const siteHostname = site.hostname.replace(/^www\./, "");
  return protocol === site.protocol && port === site.port && (hostname === siteHostname || hostname.endsWith(`.${siteHostname}`));
}

export const isGetRequest = (request: TaskRequest) => request.method.toUpperCase() === "GET";

function decodedOnce(text: string) {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

function decoded(text: string) {
  let previous = "";
  let current = text;
  while (current !== previous) [previous, current] = [current, decodedOnce(current)];
  return current;
}

function wordsOf(text: string) {
  return decoded(text).replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2").replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).join(" ");
}

type GraphqlOperation = { query?: unknown; operationName?: unknown };

function graphqlOperations(body: string): GraphqlOperation[] | undefined {
  try {
    const operations: GraphqlOperation[] = [JSON.parse(body)].flat();
    return operations.every((operation) => typeof operation?.query === "string" || typeof operation?.operationName === "string") ? operations : undefined;
  } catch {
    return undefined;
  }
}

function looksLikePaymentOperation({ query, operationName }: GraphqlOperation) {
  const name = typeof operationName === "string" ? operationName : "";
  const isMutation = typeof query === "string" && /\bmutation\b/.test(query);
  return paymentWords.test(wordsOf(isMutation ? `${name} ${query}` : name));
}

const looksLikePaymentBody = (body: string) => graphqlOperations(body)?.some(looksLikePaymentOperation) ?? paymentWords.test(wordsOf(body));

export const looksLikePayment = ({ urlPattern, bodyPattern = "" }: TaskRequest) => paymentWords.test(wordsOf(urlPattern.replace(/^https?:\/\/[^/]+/i, ""))) || looksLikePaymentBody(bodyPattern);

export function isAllowedRequest(request: TaskRequest) {
  const method = request.method.toUpperCase();
  if (method !== "GET" && method !== "POST") return false;
  if (method === "GET" && request.bodyPattern !== undefined) return false;
  return !looksLikePayment(request);
}
