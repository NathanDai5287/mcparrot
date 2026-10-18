// Checks that public/downloads/mcparrot-explorer.zip holds exactly the files in public/extension.
import { readFileSync, readdirSync } from "node:fs";
import { inflateRawSync } from "node:zlib";

const zipPath = "public/downloads/mcparrot-explorer.zip";
const extensionDir = "public/extension";

const zip = readFileSync(zipPath);
const endOfDirectory = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
if (endOfDirectory < 0) throw new Error(`${zipPath} is not a ZIP file.`);

/** @param {number} localOffset @param {number} method @param {number} compressedSize */
function extract(localOffset, method, compressedSize) {
  if (zip.readUInt32LE(localOffset) !== 0x04034b50) throw new Error("damaged local header");
  const start = localOffset + 30 + zip.readUInt16LE(localOffset + 26) + zip.readUInt16LE(localOffset + 28);
  const data = zip.subarray(start, start + compressedSize);
  if (method === 0) return data;
  if (method === 8) return inflateRawSync(data);
  throw new Error(`unsupported compression method ${method}`);
}

const entryCount = zip.readUInt16LE(endOfDirectory + 10);
let offset = zip.readUInt32LE(endOfDirectory + 16);
const entries = new Map();
for (let i = 0; i < entryCount; i++) {
  if (zip.readUInt32LE(offset) !== 0x02014b50) throw new Error(`${zipPath} has a damaged central directory.`);
  const method = zip.readUInt16LE(offset + 10);
  const compressedSize = zip.readUInt32LE(offset + 20);
  const nameLength = zip.readUInt16LE(offset + 28);
  const extraLength = zip.readUInt16LE(offset + 30);
  const commentLength = zip.readUInt16LE(offset + 32);
  const localOffset = zip.readUInt32LE(offset + 42);
  const name = zip.toString("utf8", offset + 46, offset + 46 + nameLength);
  if (!name.endsWith("/")) entries.set(name, { method, compressedSize, localOffset });
  offset += 46 + nameLength + extraLength + commentLength;
}

const problems = [];
const files = readdirSync(extensionDir, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile());
for (const file of files) {
  const name = `${file.parentPath}/${file.name}`.slice(extensionDir.length + 1);
  const entry = entries.get(name);
  entries.delete(name);
  if (!entry) {
    problems.push(`${name} is missing from the ZIP`);
    continue;
  }
  try {
    if (!extract(entry.localOffset, entry.method, entry.compressedSize).equals(readFileSync(`${extensionDir}/${name}`))) {
      problems.push(`${name} differs from the ZIP`);
    }
  } catch (error) {
    problems.push(`${name} cannot be extracted from the ZIP: ${error instanceof Error ? error.message : error}`);
  }
}
for (const name of entries.keys()) problems.push(`${name} is in the ZIP but not in ${extensionDir}`);

if (problems.length) {
  console.error(`${zipPath} is out of sync with ${extensionDir}:\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
