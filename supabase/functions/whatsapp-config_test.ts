import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

function parseWhatsappFunctionJwtConfig(tomlText: string): Map<string, boolean> {
  const result = new Map<string, boolean>();
  const lines = tomlText.split(/\r?\n/);
  let currentFn: string | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const sectionMatch = line.match(/^\[functions\.([a-zA-Z0-9_-]+)\]$/);
    if (sectionMatch) {
      currentFn = sectionMatch[1];
      continue;
    }

    if (line.startsWith("[")) {
      currentFn = null;
      continue;
    }

    if (currentFn && currentFn.startsWith("whatsapp-")) {
      const jwtMatch = line.match(/^verify_jwt\s*=\s*(true|false)$/);
      if (jwtMatch) {
        result.set(currentFn, jwtMatch[1] === "true");
      }
    }
  }

  return result;
}

Deno.test("S9: every whatsapp-* edge function folder has an explicit verify_jwt entry in supabase/config.toml", async () => {
  const configPath = new URL("../config.toml", import.meta.url);
  const tomlText = await Deno.readTextFile(configPath);
  const configured = parseWhatsappFunctionJwtConfig(tomlText);

  const functionsDir = new URL("./", import.meta.url);
  const whatsappFolders: string[] = [];

  for await (const entry of Deno.readDir(functionsDir)) {
    if (entry.isDirectory && entry.name.startsWith("whatsapp-")) {
      whatsappFolders.push(entry.name);
    }
  }

  for (const folder of whatsappFolders) {
    assert(
      configured.has(folder),
      `Missing explicit [functions.${folder}] verify_jwt entry in supabase/config.toml`,
    );
  }

  assertEquals(configured.get("whatsapp-enqueue"), true);
  assertEquals(configured.get("whatsapp-session"), true);
  assertEquals(configured.get("whatsapp-worker"), false);
  assertEquals(configured.get("whatsapp-inbound"), false);
  assertEquals(configured.get("whatsapp-watchdog"), false);
});
