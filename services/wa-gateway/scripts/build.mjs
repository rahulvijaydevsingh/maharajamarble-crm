import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

// 1. Run forbidden-host check first
execSync("node scripts/check-forbidden-hosts.mjs", {
  cwd: rootDir,
  stdio: "inherit",
});

// 2. Verify dist directory exists
const distDir = path.join(rootDir, "dist");
fs.mkdirSync(distDir, { recursive: true });
console.log("wa-gateway build verification completed.");