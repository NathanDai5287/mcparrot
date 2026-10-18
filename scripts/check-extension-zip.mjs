// Checks that public/downloads/mcparrot-explorer.zip holds exactly the files in public/extension.
import { readFileSync, readdirSync } from "node:fs";
import { crc32 } from "node:zlib";

const zipPath = "public/downloads/mcparrot-explorer.zip";
const extensionDir = "public/extension";

const zip = readFileSync(zipPath);
const endOfDirectory = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
if (endOfDirectory < 0) throw new Error(`${zipPath} is not a ZIP file.`);

const entryCount = zip.readUInt16LE(endOfDirectory + 10);
let offset = zip.readUInt32LE(endOfDirectory + 16);
const entries = new Map();
for (let i = 0; i < entryCount; i++) {
  if (zip.readUInt32LE(offset) !== 0x02014b50) throw new Error(`${zipPath} has a damaged central directory.`);
  const crc = zip.readUInt32LE(offset + 16);
  const size = zip.readUInt32LE(offset + 24);
  const nameLength = zip.readUInt16LE(offset + 28);
  const extraLength = zip.readUInt16LE(offset + 30);
  const commentLength = zip.readUInt16LE(offset + 32);
  const name = zip.toString("utf8", offset + 46, offset + 46 + nameLength);
  if (!name.endsWith("/")) entries.set(name, { crc, size });
  offset += 46 + nameLength + extraLength + commentLength;
}

const problems = [];
for (const name of readdirSync(extensionDir)) {
  const entry = entries.get(name);
  const file = readFileSync(`${extensionDir}/${name}`);
  if (!entry) problems.push(`${name} is missing from the ZIP`);
  else if (entry.size !== file.length || entry.crc !== crc32(file)) problems.push(`${name} differs from the ZIP`);
  entries.delete(name);
}
for (const name of entries.keys()) problems.push(`${name} is in the ZIP but not in ${extensionDir}`);

if (problems.length) {
  console.error(`${zipPath} is out of sync with ${extensionDir}:\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
