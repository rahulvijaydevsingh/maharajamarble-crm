import path from "node:path";

export interface GatewayConfig {
  appEnv: "production" | "preview";
  supabaseUrl: string;
  supabasePublishableKey: string;
  workerId: string;
  workerSecret: string;
  authEncKey: Buffer;
  dataDir: string;
  maxActiveSessions: number;
  logLevel: "debug" | "info" | "warn" | "error";
  baileysWebVersion?: [number, number, number];
  hostLabel: string;
}

export function loadGatewayConfig(env: NodeJS.ProcessEnv = process.env): GatewayConfig {
  const appEnv = env.WA_ENV === "production" ? "production" : "preview";
  const supabaseUrl = (env.WA_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
  const supabasePublishableKey = (env.WA_SUPABASE_PUBLISHABLE_KEY ?? "").trim();
  const workerId = (env.WA_WORKER_ID ?? `wa-worker-${appEnv}`).trim();
  const workerSecret = (env.WA_WORKER_SECRET ?? "").trim();
  const rawEncKey = (env.WA_AUTH_ENC_KEY ?? "").trim();

  if (!supabaseUrl) throw new Error("CONFIG_INVALID: WA_SUPABASE_URL is required");
  if (!supabasePublishableKey) throw new Error("CONFIG_INVALID: WA_SUPABASE_PUBLISHABLE_KEY is required");
  if (!workerSecret) throw new Error("CONFIG_INVALID: WA_WORKER_SECRET is required");
  if (!rawEncKey) throw new Error("CONFIG_INVALID: WA_AUTH_ENC_KEY (base64 32 bytes) is required");

  const authEncKey = Buffer.from(rawEncKey, "base64");
  if (authEncKey.length !== 32) {
    throw new Error(`CONFIG_INVALID: WA_AUTH_ENC_KEY must decode to exactly 32 bytes (got ${authEncKey.length})`);
  }

  const dataDir = path.resolve(env.WA_DATA_DIR ?? "./data");
  const maxActiveSessions = Math.max(1, Math.min(10, Number(env.WA_MAX_ACTIVE_SESSIONS ?? 3)));
  const logLevel = (env.WA_LOG_LEVEL ?? "info") as GatewayConfig["logLevel"];
  const hostLabel = (env.WA_HOST_LABEL ?? `${process.platform}-${process.arch}`).trim();

  let baileysWebVersion: [number, number, number] | undefined;
  if (env.WA_BAILEYS_WEB_VERSION) {
    const parts = env.WA_BAILEYS_WEB_VERSION.split(".").map((n) => Number(n.trim()));
    if (parts.length === 3 && parts.every((n) => Number.isInteger(n) && n >= 0)) {
      baileysWebVersion = [parts[0], parts[1], parts[2]];
    }
  }

  return {
    appEnv,
    supabaseUrl,
    supabasePublishableKey,
    workerId,
    workerSecret,
    authEncKey,
    dataDir,
    maxActiveSessions,
    logLevel,
    baileysWebVersion,
    hostLabel,
  };
}