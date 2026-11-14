import fs from "node:fs/promises";
import path from "node:path";
import pino from "pino";
import { loadGatewayConfig } from "./config";
import { EncryptedFileAuthStore } from "./adapters/encryptedFileAuthStore";
import { SupabaseControlPlane, SystemClock } from "./adapters/supabaseControlPlane";
import { computeAdaptivePollIntervalMs, DoorbellClient } from "./runtime/doorbellClient";
import { SessionRuntime, mapDisconnectCodeToDirective } from "./runtime/sessionRuntime";
import { QueueRunner } from "./runtime/queueRunner";
import { InMemoryAntispamState } from "../vendor/wa-akg/antispam";
import { WaChatService } from "../vendor/wa-akg/chat.service";
import type { ContactJidStore, Logger, MessageLog, WaSocketLike } from "./ports/index";

async function writeHealthFile(dataDir: string, payload: Record<string, unknown>): Promise<void> {
  const healthPath = path.join(dataDir, "health.json");
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(healthPath, JSON.stringify(payload, null, 2), "utf8");
}

export async function startGatewayWorker(): Promise<void> {
  const config = loadGatewayConfig();
  const pinoLogger = pino({ level: config.logLevel });
  const logger: Logger = {
    info: (msg, meta) => pinoLogger.info(meta ?? {}, msg),
    warn: (msg, meta) => pinoLogger.warn(meta ?? {}, msg),
    error: (msg, meta) => pinoLogger.error(meta ?? {}, msg),
  };
  const clock = new SystemClock();
  const authStore = new EncryptedFileAuthStore(config.dataDir, config.authEncKey, logger);
  await authStore.acquireProcessLock();
  const controlPlane = new SupabaseControlPlane(
    config.supabaseUrl, config.workerId, config.workerSecret, clock, logger,
  );

  const resolvedJids = new Map<string, string>();
  const contactStore: ContactJidStore = {
    getResolvedJid: (phone10) => resolvedJids.get(phone10) ?? null,
    setResolvedJid: (phone10, jid) => resolvedJids.set(phone10, jid),
  };
  const antispam = new InMemoryAntispamState({ minIntervalMs: 10_000, dailyCeiling: 200 });
  const messageLog: MessageLog = {
    recordLocalSendAttempt: (entry) => logger.info("Outbound send recorded", {
      sessionKey: entry.sessionKey, queueId: entry.queueId, attemptId: entry.attemptId,
    }),
  };

  let triggerImmediateSync = () => {};
  const sessionRuntime = new SessionRuntime(
    authStore, config.maxActiveSessions, logger, () => triggerImmediateSync(),
  );
  let shuttingDown = false;
  const intentionalCloses = new Set<string>();

  const createSocket = async (sessionKey: string): Promise<WaSocketLike> => {
    const baileys = await import("@whiskeysockets/baileys");
    const credentials: any = (await authStore.loadSessionCredentials(sessionKey)) ?? baileys.initAuthCreds();
    const keyStore = {
      get: async (category: string, ids: string[]) => {
        const values: Record<string, unknown> = {};
        await Promise.all(ids.map(async (id) => {
          const value = await authStore.loadKey(sessionKey, category, id);
          if (value !== null) values[id] = value;
        }));
        return values;
      },
      set: async (data: Record<string, Record<string, unknown | null>>) => {
        const writes: Promise<void>[] = [];
        for (const [category, items] of Object.entries(data)) {
          for (const [id, value] of Object.entries(items)) {
            writes.push(authStore.saveKey(sessionKey, category, id, value));
          }
        }
        await Promise.all(writes);
      },
    };
    const authState = {
      creds: credentials,
      keys: baileys.makeCacheableSignalKeyStore(keyStore as never, pino({ level: "silent" })),
    };
    const socket = baileys.default({
      auth: authState,
      logger: pino({ level: "silent" }) as never,
      printQRInTerminal: false,
      markOnlineOnConnect: false,
      syncFullHistory: false,
      ...(config.baileysWebVersion ? { version: config.baileysWebVersion } : {}),
    });

    socket.ev.on("creds.update", () => {
      void authStore.saveSessionCredentials(sessionKey, credentials).catch((err) => {
        logger.error("Encrypted WhatsApp credentials could not be persisted", {
          sessionKey, error: err instanceof Error ? err.message : String(err),
        });
      });
    });

    socket.ev.on("connection.update", (update) => {
      if (update.qr) {
        sessionRuntime.updateConnection(sessionKey, { status: "awaiting_qr", qr: update.qr });
      }
      if (update.connection === "open") {
        const jid = socket.user?.id ?? null;
        sessionRuntime.updateConnection(sessionKey, {
          status: "connected",
          qr: null,
          phoneNumber: jid ? jid.split("@")[0].split(":")[0] : null,
          waJid: jid,
          pushName: socket.user?.name ?? null,
        });
      }
      if (update.connection === "close") {
        if (shuttingDown || intentionalCloses.delete(sessionKey)) return;
        const sessionState = sessionRuntime.getOrCreateState(sessionKey);
        const statusCode = (update.lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode;
        const directive = mapDisconnectCodeToDirective(statusCode, sessionState.reconnectAttempts);
        sessionState.reconnectAttempts += 1;
        sessionState.lastReconnectAtMs = Date.now();
        const reason = directive.action === "pause_safety" || directive.action === "quarantine_and_error"
          ? directive.reason
          : String(update.lastDisconnect?.error ?? "Connection closed");
        if (directive.action === "wipe_and_logged_out") {
          void authStore.wipeSession(sessionKey);
          sessionRuntime.updateConnection(sessionKey, { status: "logged_out", disconnect: { code: statusCode, reason } });
          return;
        }
        if (directive.action === "pause_safety") {
          sessionRuntime.updateConnection(sessionKey, { status: "paused_safety", disconnect: { code: statusCode, reason } });
          return;
        }
        if (directive.action === "quarantine_and_error") {
          void authStore.quarantineSession(sessionKey);
          sessionRuntime.updateConnection(sessionKey, { status: "error", disconnect: { code: statusCode, reason } });
          return;
        }
        sessionRuntime.updateConnection(sessionKey, { status: "disconnected", disconnect: { code: statusCode, reason } });
        const delayMs = directive.action === "recreate_immediately" ? 1_000 : directive.delayMs;
        setTimeout(() => {
          void sessionRuntime.handleCommand({ session_key: sessionKey, action: "connect" }, createSocket)
            .catch((err) => logger.warn("Automatic reconnect failed", {
              sessionKey, error: err instanceof Error ? err.message : String(err),
            }));
        }, delayMs);
      }
    });
    return socket as unknown as WaSocketLike;
  };

  const chatService = new WaChatService(
    sessionRuntime, contactStore, antispam, messageLog, clock, logger,
  );
  const queueRunner = new QueueRunner(chatService);
  const pendingResults: Array<Record<string, unknown>> = [];
  let syncInFlight = false;
  let syncRequested = false;

  const hello = await controlPlane.hello({
    appEnv: config.appEnv, version: "2.0.0", hostLabel: config.hostLabel,
  });
  const doorbell = new DoorbellClient(
    config.supabaseUrl, config.supabasePublishableKey, hello.doorbell_channel,
    () => triggerImmediateSync(), logger,
  );
  doorbell.start();

  const runSyncTick = async (): Promise<void> => {
    if (shuttingDown) return;
    if (syncInFlight) {
      syncRequested = true;
      return;
    }
    syncInFlight = true;
    try {
      const reports = sessionRuntime.getAllReports((sessionKey) =>
        queueRunner.isSessionReadyForClaim(sessionKey, clock.nowMs()),
      );
      const resultsToSend = pendingResults.slice();
      const response = await controlPlane.sync({
        sessions: reports,
        results: resultsToSend,
        stats: {
          rss_mb: Math.round(process.memoryUsage().rss / (1024 * 1024)),
          uptime_s: Math.round(process.uptime()),
          spool_depth: 0,
          last_error: doorbell.isDownOverOneHour() ? "DOORBELL_DOWN" : null,
        },
      });
      if (resultsToSend.length) pendingResults.splice(0, resultsToSend.length);
      for (const command of response.commands) {
        if (command.action === "disconnect" || command.action === "logout") {
          intentionalCloses.add(command.session_key);
        }
        await sessionRuntime.handleCommand(command, createSocket);
      }
      for (const item of response.items) {
        pendingResults.push(await queueRunner.executeClaimedItem(item, response.flags));
      }
    } catch (err) {
      logger.error("Sync loop error", { error: err instanceof Error ? err.message : String(err) });
    } finally {
      syncInFlight = false;
      if (syncRequested && !shuttingDown) {
        syncRequested = false;
        setTimeout(() => void runSyncTick(), 1_000);
      }
    }
  };

  triggerImmediateSync = () => { void runSyncTick(); };
  const healthInterval = setInterval(() => {
    void writeHealthFile(config.dataDir, {
      worker_id: config.workerId, updated_at: new Date().toISOString(),
      rss_mb: Math.round(process.memoryUsage().rss / (1024 * 1024)),
      uptime_s: Math.round(process.uptime()),
    });
  }, 15_000);
  const janitorInterval = setInterval(() => {
    void controlPlane.janitor().catch((err) => logger.warn("Janitor tick error", {
      error: err instanceof Error ? err.message : String(err),
    }));
  }, 10 * 60_000);

  const pollLoop = async () => {
    while (!shuttingDown) {
      await runSyncTick();
      const hasWantedSessions = sessionRuntime.getAllReports(() => false).length > 0;
      await new Promise((resolve) => setTimeout(resolve, computeAdaptivePollIntervalMs({
        doorbellHealthy: doorbell.isHealthy(),
        isPairingOrSending: pendingResults.length > 0 || reportsAreActive(sessionRuntime),
        hasActiveOrWantedSessions: hasWantedSessions,
      })));
    }
  };

  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    clearInterval(healthInterval);
    clearInterval(janitorInterval);
    doorbell.stop();
    for (const sessionKey of ["main", "bulk"]) {
      const socket = sessionRuntime.getSocket(sessionKey) as (WaSocketLike & { end?: () => void }) | null;
      try { socket?.end?.(); } catch { /* ignore shutdown races */ }
    }
    await authStore.releaseProcessLock();
    logger.info("Gateway worker shut down cleanly");
  };
  process.on("SIGTERM", () => void shutdown());
  process.on("SIGINT", () => void shutdown());
  void pollLoop();
}

function reportsAreActive(runtime: SessionRuntime): boolean {
  return runtime.getAllReports(() => false).some((session) => {
    const status = session.status;
    return status === "awaiting_qr" || status === "connecting" || status === "connected" || status === "reconnecting";
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startGatewayWorker().catch((err) => {
    console.error("Fatal worker startup error:", err);
    process.exit(1);
  });
}
