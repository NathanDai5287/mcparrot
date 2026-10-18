const answerCharacters = 20_000;
const stringCharacters = 2_000;
const tableRows = 3;
const sharedColumnShare = 0.6;
const noiseKey = /^__typename$|tracking(?![-_]?(?:number|url|link|code|status|id))|analytics|telemetry|experiment|logging/i;
const opaqueToken = /^(?![./])(?![\w\-.=+/]*\.[a-z]\w{1,4}$)[\w\-.=+/]{80,}$/i;
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
  if (typeof value === "string") return opaqueToken.test(value) ? null : shortString(markup.test(value) ? plainText(value) : value);
  if (Array.isArray(value)) return value.map(compacted).filter(isPresent);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !noiseKey.test(key)).map(([key, item]) => [key, compacted(item)]).filter(([, item]) => isPresent(item)));
}

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);

const fieldPath = (field: string) => field.match(/\[\]|[^.[\]]+/g) ?? [];

function picked(value: unknown, paths: string[][]): unknown {
  if (paths.some((path) => !path.length)) return value;
  if (Array.isArray(value)) return value.map((item) => picked(item, paths.map((path) => path[0] === "[]" ? path.slice(1) : path))).filter((item) => item !== undefined);
  if (!isRecord(value)) return undefined;
  return Object.fromEntries(Object.entries(value).flatMap(([key, item]) => {
    const inner = paths.filter((path) => path[0] === key).map((path) => path.slice(1));
    return inner.length ? [[key, picked(item, inner)]] : [];
  }));
}

const flattened = (item: Record<string, unknown>, prefix = ""): [string, unknown][] => Object.entries(item).flatMap(([key, value]) => isRecord(value) && !prefix ? flattened(value, `${key}.`) : [[`${prefix}${key}`, value]]);

const cell = (value: unknown) => (typeof value === "string" ? value : value === undefined ? "" : JSON.stringify(value)).replace(/\|/g, "\\|").replace(/\n/g, "\\n");

function table(items: unknown[]) {
  if (items.length < tableRows || !items.every(isRecord)) return undefined;
  const rows = items.map((item) => Object.fromEntries(flattened(item)));
  if (rows.some((row) => Object.values(row).some((value) => Array.isArray(value) && value.some(isRecord)))) return undefined;
  const columns = [...new Set(rows.flatMap(Object.keys))];
  const filledCells = rows.reduce((count, row) => count + Object.keys(row).length, 0);
  if (filledCells < columns.length * rows.length * sharedColumnShare) return undefined;
  const constant = columns.filter((column) => rows.every((row) => column in row && JSON.stringify(row[column]) === JSON.stringify(rows[0][column])));
  const varying = constant.length < columns.length ? columns.filter((column) => !constant.includes(column)) : columns;
  const shared = varying === columns ? [] : [`every row: ${constant.map((column) => `${column}=${cell(rows[0][column])}`).join("; ")}`];
  return { lines: [...shared, ...[varying, ...rows.map((row) => varying.map((column) => row[column]))].map((line) => line.map(cell).join(" | "))], headLines: shared.length + 1 };
}

type Rendered = { text: string; tables: { start: number; lineEnds: number[]; headLines: number }[] };

function render(value: unknown, out: Rendered) {
  if (isRecord(value)) {
    out.text += "{";
    Object.entries(value).forEach(([key, item], index) => {
      out.text += `${index ? "," : ""}${JSON.stringify(key)}:`;
      render(item, out);
    });
    out.text += "}";
    return;
  }
  if (!Array.isArray(value)) {
    out.text += String(JSON.stringify(value));
    return;
  }
  const rows = table(value);
  out.text += "[";
  if (rows === undefined) value.forEach((item, index) => {
    if (index) out.text += ",";
    render(item, out);
  });
  else {
    const start = out.text.length;
    out.tables.push({ start, lineEnds: rows.lines.map((line) => (out.text += `\n${line}`).length), headLines: rows.headLines });
    out.text += "\n";
  }
  out.text += "]";
}

function rendered(value: unknown) {
  const out: Rendered = { text: "", tables: [] };
  render(value, out);
  return out;
}

function compactBody(body: string, keepFields: string[]) {
  try {
    const parsed: unknown = JSON.parse(body);
    const filtered = keepFields.length ? compacted(picked(parsed, keepFields.map(fieldPath))) : undefined;
    const whole = compacted(parsed);
    const isFiltered = filtered !== undefined && isPresent(filtered) && JSON.stringify(filtered) !== JSON.stringify(whole);
    return { ...rendered(isFiltered ? filtered : whole), isFiltered };
  } catch {
    return { text: markup.test(body) ? plainText(body) : body, tables: [], isFiltered: false };
  }
}


export function compactAnswer(body: string, keepFields: string[] = []) {
  const { text, tables, isFiltered } = compactBody(body, keepFields);
  if (text.length <= answerCharacters) return text;
  const narrowRequest = `${isFiltered ? "fullAnswer adds the other fields but not more of this answer" : "fullAnswer will not show more"}. Ask the user to narrow the request.`;
  const cutTable = tables.find(({ start, lineEnds }) => start <= answerCharacters && lineEnds.at(-1)! > answerCharacters);
  if (!cutTable) return `${text.slice(0, answerCharacters)}\n[answer shortened: ${text.length - answerCharacters} more characters were cut. ${narrowRequest}]`;
  const shownLines = cutTable.lineEnds.filter((end) => end <= answerCharacters);
  return `${text.slice(0, shownLines.at(-1) ?? cutTable.start)}\n[showing ${Math.max(0, shownLines.length - cutTable.headLines)} of ${cutTable.lineEnds.length - cutTable.headLines} rows; the rest were cut. ${narrowRequest}]`;
}
