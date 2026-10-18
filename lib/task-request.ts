import type { TaskRequest } from "./capabilities";

export const urlPlaceholderPattern = /\{([^}]+)\}/g;
export const bodyPlaceholderPattern = /\{([A-Za-z_]\w*|step\d+(?:\.[\w-]+)+)\}/g;
export const stepPlaceholderPattern = /^step(\d+)\.(.+)$/;
const graphqlPlaceholderPattern = /\\"\{([A-Za-z_]\w*|step\d+(?:\.[\w-]+)+)\}\\"/g;
const jsonStringPattern = /"(?:[^"\\]|\\.)*"/g;
const graphqlDocument = /^\s*(#[^\n]*\n\s*)*((query|mutation|subscription|fragment)\b|\{)/;
const graphqlKeys = ["query", "operationName", "variables", "extensions"];
const paymentWords = /\b(check ?outs?|payments?|pay|purchases?|place orders?|create orders?|submit orders?|order create)\b/;
export const paymentRefusal = "MCParrot refuses tool requests that look like checkout or payment, so a tool can never place an order. Orders go only through the Pay with Link ordering tools.";

const replayedHeaderNames = ["accept", "apollographql-client-name", "apollographql-client-version", "client-identifier", "github-verified-fetch", "notion-client-version", "x-apollo-operation-name", "x-channel-id", "x-client-identifier", "x-experience-id", "x-notion-active-user-header", "x-requested-with", "x-restli-protocol-version"];

export const replayedHeaders = (headers: Record<string, string> = {}) => Object.fromEntries(Object.entries(headers).filter(([name]) => replayedHeaderNames.includes(name.toLowerCase())));

const isGraphqlDocument = (text: string) => graphqlDocument.test(text) && !/^\s*\{[^{}]*\}\s*$/.test(text);

export type BodyPlace = { inString: boolean; inGraphql: boolean };

export type PlaceholderReplacer = (name: string, match: string, place: BodyPlace) => string;

function replacedInString(literal: string, replace: PlaceholderReplacer) {
  let text = "";
  try {
    text = JSON.parse(literal);
  } catch {}
  if (!isGraphqlDocument(text)) return literal.replace(bodyPlaceholderPattern, (match, name: string) => replace(name, match, { inString: true, inGraphql: false }));
  return literal.replace(graphqlPlaceholderPattern, (match, name: string) => `\\"${replace(name, match.slice(2, -2), { inString: true, inGraphql: true })}\\"`);
}

export function replaceBodyPlaceholders(body: string, replace: PlaceholderReplacer) {
  const outside = (text: string) => text.replace(bodyPlaceholderPattern, (match, name: string) => replace(name, match, { inString: false, inGraphql: false }));
  let replaced = "";
  let end = 0;
  for (const literal of body.matchAll(jsonStringPattern)) {
    replaced += outside(body.slice(end, literal.index)) + replacedInString(literal[0], replace);
    end = literal.index + literal[0].length;
  }
  return replaced + outside(body.slice(end));
}

function bodyPlaceholders(body: string) {
  const names: string[] = [];
  replaceBodyPlaceholders(body, (name, match) => {
    names.push(name);
    return match;
  });
  return names;
}

const allPlaceholders = ({ urlPattern, bodyPattern = "" }: TaskRequest) => [...[...urlPattern.matchAll(urlPlaceholderPattern)].map((match) => match[1]), ...bodyPlaceholders(bodyPattern)];

export const requestPlaceholders = (request: TaskRequest) => allPlaceholders(request).filter((name) => !stepPlaceholderPattern.test(name));

export const usesOnlyEarlierSteps = (requests: TaskRequest[]) => requests.every((request, index) => allPlaceholders(request).every((name) => {
  const step = name.match(stepPlaceholderPattern)?.[1];
  return step === undefined || (Number(step) >= 1 && Number(step) <= index);
}));

export function isOnWebsite(address: string | URL, website: string) {
  const { protocol, hostname, port } = new URL(address);
  const site = new URL(website);
  const siteHostname = site.hostname.replace(/^www\./, "");
  return (protocol === site.protocol || (site.protocol === "http:" && protocol === "https:")) && port === site.port && (hostname === siteHostname || hostname.endsWith(`.${siteHostname}`));
}

export const isGetRequest = (request: TaskRequest) => request.method.toUpperCase() === "GET";

function decodedOnce(text: string) {
  return text.replace(/(%[0-9a-f]{2})+/gi, (escapes) => {
    try {
      return decodeURIComponent(escapes);
    } catch {
      return escapes.replace(/%([0-9a-f]{2})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
    }
  });
}

function decoded(text: string) {
  let previous = "";
  let current = text;
  while (current !== previous) [previous, current] = [current, decodedOnce(current)];
  return current;
}

function wordsOf(text: string) {
  return decoded(text).replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2").replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/([a-z])(\d)/gi, "$1 $2").replace(/(\d)([a-z])/gi, "$1 $2").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).join(" ");
}

const hasPaymentWords = (text: string) => paymentWords.test(wordsOf(text));

function jsonStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(jsonStrings);
  if (value !== null && typeof value === "object") return Object.entries(value).flatMap(([key, item]) => [key, ...jsonStrings(item)]);
  return [];
}

function parsedJson(text: string): { value: unknown } | undefined {
  try {
    return { value: JSON.parse(text) };
  } catch {
    return undefined;
  }
}

type GraphqlOperation = Record<string, unknown> & { query: string };

function graphqlOperations(body: unknown) {
  const operations: unknown[] = [body].flat();
  const isOperation = (operation: unknown): operation is GraphqlOperation => operation !== null && typeof operation === "object" && !Array.isArray(operation) && typeof (operation as GraphqlOperation).query === "string" && isGraphqlDocument((operation as GraphqlOperation).query);
  return operations.length > 0 && operations.every(isOperation) ? operations : undefined;
}

function looksLikePaymentOperation(operation: GraphqlOperation) {
  const name = typeof operation.operationName === "string" ? operation.operationName : "";
  const isMutation = /\bmutation\b/.test(operation.query);
  const otherFields = Object.entries(operation).filter(([key]) => isMutation ? key !== "query" && key !== "operationName" : !graphqlKeys.includes(key));
  return hasPaymentWords(isMutation ? `${name} ${operation.query}` : name) || hasPaymentWords(jsonStrings(Object.fromEntries(otherFields)).join(" "));
}

function looksLikePaymentBody(body: string) {
  const parsed = parsedJson(body);
  const operations = parsed && graphqlOperations(parsed.value);
  if (operations) return operations.some(looksLikePaymentOperation);
  return hasPaymentWords(body) || (parsed !== undefined && hasPaymentWords(jsonStrings(parsed.value).join(" ")));
}

export const looksLikePayment = ({ urlPattern, bodyPattern = "" }: TaskRequest) => hasPaymentWords(urlPattern) || looksLikePaymentBody(bodyPattern);

export function isAllowedRequest(request: TaskRequest) {
  const method = request.method.toUpperCase();
  if (method !== "GET" && method !== "POST") return false;
  if (method === "GET" && request.bodyPattern !== undefined) return false;
  return !looksLikePayment(request);
}
