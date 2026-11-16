import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const hosts = spawnSync(
  process.execPath,
  [path.join(rootDir, "scripts", "check-forbidden-hosts.mjs")],
  { stdio: "inherit" },
);
if (hosts.status !== 0) {
  process.exit(hosts.status ?? 1);
}

await mkdir(path.join(rootDir, "dist"), { recursive: true });
await build({
  entryPoints: [path.join(rootDir, "src", "main.ts")],
  outfile: path.join(rootDir, "dist", "main.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  packages: "external",
  sourcemap: true,
  logLevel: "info",
});