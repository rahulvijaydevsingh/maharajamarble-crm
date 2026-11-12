import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

const FORBIDDEN_PATTERNS = [
  "aikeigroup",
  "api.github.com",
  "wa-sticker-formatter",
];

function collectFiles(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "scripts" || entry.name.endsWith(".md")) {
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(fullPath, acc);
    } else if (/\.(ts|js|mjs|cjs|json)$/.test(entry.name)) {
      acc.push(fullPath);
    }
  }
  return acc;
}

const files = collectFiles(rootDir);
const violations = [];

for (const file of files) {
  const content = fs.readFileSync(file, "utf8");
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (content.includes(pattern)) {
      violations.push(`${path.relative(rootDir, file)} contains forbidden string "${pattern}"`);
    }
  }
}

if (violations.length > 0) {
  console.error("FORBIDDEN HOST CHECK FAILED:\n" + violations.join("\n"));
  process.exit(1);
}

console.log(`Forbidden host check passed across ${files.length} gateway files.`);
