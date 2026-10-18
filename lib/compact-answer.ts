const answerCharacters = 20_000;
const stringCharacters = 2_000;
const noiseKey = /^__typename$|tracking|analytics|telemetry|experiment|logging/i;
const markup = /<\/?[a-z][\w:-]*(\s[^<>]*)?\/?>/i;
const namedEntities: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " " };

const decoded = (text: string) => text.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, name: string) => name.startsWith("#") ? String.fromCodePoint(Number(name.slice(1).replace(/^x/i, "0x"))) : namedEntities[name.toLowerCase()] ?? entity);

const plainText = (text: string) => decoded(text
  .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ")
  .replace(/<(?:img|image)\b[^>]*?\bsrc=["']?([^"'\s>]+)[^>]*>/gi, " [image: $1] ")
  .replace(/<[^>]+>/g, " "))
  .replace(/[^\S\n]+/g, " ")
  .replace(/\s*\n\s*/g, "\n")
  .trim();

const shortString = (text: string) => text.length > stringCharacters ? `${text.slice(0, stringCharacters)}… [${text.length - stringCharacters} more characters]` : text;

const isPresent = (value: unknown) => value !== null && value !== "" && !(typeof value === "object" && Object.keys(value).length === 0);

function compacted(value: unknown): unknown {
  if (typeof value === "string") return shortString(markup.test(value) ? plainText(value) : value);
  if (Array.isArray(value)) return value.map(compacted).filter(isPresent);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !noiseKey.test(key)).map(([key, item]) => [key, compacted(item)]).filter(([, item]) => isPresent(item)));
}

function compactBody(body: string) {
  try {
    return JSON.stringify(compacted(JSON.parse(body)));
  } catch {
    return markup.test(body) ? plainText(body) : body;
  }
}

export function compactAnswer(body: string) {
  const text = compactBody(body);
  return text.length > answerCharacters ? `${text.slice(0, answerCharacters)}\n[answer shortened: ${text.length - answerCharacters} more characters]` : text;
}
