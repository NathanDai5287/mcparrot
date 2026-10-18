const answerCharacters = 20_000;
const stringCharacters = 2_000;
const tableRows = 3;
const sharedColumnShare = 0.6;
const noiseKey = /^__typename$|(?<![a-z])(?:tracking(?![-_]?(?:number|url|link|code|status|id))|analytics|telemetry|experiments?|logging)(?![a-z])/i;
const tag = /<\/?[a-z][\w:-]*(?:\s+[^\s<>"'=\/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'<>`=]+))?)*\s*\/?>/gi;
const startsWithMarkup = /^\s*<(?:[a-z!?]|\/[a-z])/i;
const namedEntities: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " " };

const keyWords = (key: string) => key.replace(/([a-z\d])([A-Z])|([A-Z])([A-Z][a-z])/g, "$1$3_$2$4");

function hasMarkup(text: string) {
  if (startsWithMarkup.test(text)) return true;
  const closed = new Set(Array.from(text.matchAll(/<\/([a-z][\w:-]*)\s*>/gi), (match) => match[1].toLowerCase()));
  return closed.size > 0 && Array.from(text.matchAll(/<([a-z][\w:-]*)[\s\/>]/gi)).some((match) => closed.has(match[1].toLowerCase()));
}

const codePoint = (entity: string, code: number) => code > 0 && code <= 0x10FFFF ? String.fromCodePoint(code) : entity;

const decoded = (text: string) => text.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, name: string) => name.startsWith("#") ? codePoint(entity, Number(name.slice(1).replace(/^x/i, "0x"))) : namedEntities[name.toLowerCase()] ?? entity);

const plainText = (text: string) => decoded(text
  .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ")
  .replace(/<(?:img|image)\b[^>]*?\bsrc=["']?([^"'\s>]+)[^>]*>/gi, " [image: $1] ")
  .replace(/<!--[\s\S]*?-->|<[!?][^<>]*>/g, " ")
  .replace(tag, " "))
  .replace(/[^\S\n]+/g, " ")
  .replace(/\s*\n\s*/g, "\n")
  .trim();

const shortString = (text: string) => text.length > stringCharacters ? `${text.slice(0, stringCharacters)}… [${text.length - stringCharacters} more characters]` : text;

class LargeInteger {
  source: string;
  constructor(source: string) {
    this.source = source;
  }
}

const keptLargeIntegers = (_key: string, value: unknown, context?: { source: string }) => typeof value === "number" && !Number.isSafeInteger(value) && context && /^-?\d+$/.test(context.source) ? new LargeInteger(context.source) : value;

const isPresent = (value: unknown) => value !== null && value !== "" && !(typeof value === "object" && Object.keys(value).length === 0);

function withoutTrailingNulls(items: unknown[]) {
  let end = items.length;
  while (end && items[end - 1] === null) end -= 1;
  return items.slice(0, end);
}

function compacted(value: unknown): unknown {
  if (typeof value === "string") return shortString(hasMarkup(value) ? plainText(value) : value);
  if (Array.isArray(value)) return withoutTrailingNulls(value.map((item) => compacted(item)).map((item) => isPresent(item) ? item : null));
  if (value === null || typeof value !== "object" || value instanceof LargeInteger) return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !noiseKey.test(keyWords(key))).map(([key, item]) => [key, compacted(item)]).filter(([, item]) => isPresent(item)));
}

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) && !(value instanceof LargeInteger);

const fieldPath = (field: string) => field.match(/\[\]|[^.[\]]+/g) ?? [];

function picked(value: unknown, paths: string[][]): unknown {
  if (paths.some((path) => !path.length)) return value;
  if (Array.isArray(value)) return value.map((item) => picked(item, paths.map((path) => path[0] === "[]" ? path.slice(1) : path))).map((item) => item ?? null);
  if (!isRecord(value)) return undefined;
  return Object.fromEntries(Object.entries(value).flatMap(([key, item]) => {
    const inner = paths.filter((path) => path[0] === key).map((path) => path.slice(1));
    return inner.length ? [[key, picked(item, inner)]] : [];
  }));
}

const flattened = (item: Record<string, unknown>, prefix = ""): [string, unknown][] => Object.entries(item).flatMap(([key, value]) => isRecord(value) && !prefix ? flattened(value, `${key}.`) : [[`${prefix}${key}`, value]]);

function json(value: unknown): string {
  if (value instanceof LargeInteger) return value.source;
  if (Array.isArray(value)) return `[${value.map(json).join(",")}]`;
  if (isRecord(value)) return `{${Object.entries(value).map(([key, item]) => `${JSON.stringify(key)}:${json(item)}`).join(",")}}`;
  return JSON.stringify(value);
}

const cell = (value: unknown) => (typeof value === "string" ? value : value === undefined ? "" : json(value)).replace(/\|/g, "\\|").replace(/\n/g, "\\n");

function table(items: unknown[]) {
  if (items.length < tableRows || !items.every(isRecord)) return undefined;
  const rows = items.map((item) => Object.fromEntries(flattened(item)));
  if (rows.some((row) => Object.values(row).some((value) => Array.isArray(value) && value.some(isRecord)))) return undefined;
  const columns = [...new Set(rows.flatMap(Object.keys))];
  const filledCells = rows.reduce((count, row) => count + Object.keys(row).length, 0);
  if (filledCells < columns.length * rows.length * sharedColumnShare) return undefined;
  return [columns, ...rows.map((row) => columns.map((column) => row[column]))].map((line) => line.map(cell).join(" | ")).join("\n");
}

function rendered(value: unknown): string {
  if (isRecord(value)) return `{${Object.entries(value).map(([key, item]) => `${JSON.stringify(key)}:${rendered(item)}`).join(",")}}`;
  if (!Array.isArray(value)) return json(value);
  const rows = table(value);
  return rows === undefined ? `[${value.map(rendered).join(",")}]` : `[\n${rows}\n]`;
}

function compactBody(body: string, keepFields: string[]) {
  try {
    const parsed: unknown = JSON.parse(body, keptLargeIntegers);
    const filtered = keepFields.length ? compacted(picked(parsed, keepFields.map(fieldPath))) : undefined;
    return rendered(filtered !== undefined && isPresent(filtered) ? filtered : compacted(parsed));
  } catch {
    return hasMarkup(body) ? plainText(body) : body;
  }
}

export const shortAnswer = (text: string) => text.length > answerCharacters ? `${text.slice(0, answerCharacters)}\n[answer shortened: ${text.length - answerCharacters} more characters]` : text;

export const compactAnswer = (body: string, keepFields: string[] = []) => shortAnswer(compactBody(body, keepFields));
