import type { Logger, SessionRegistry, WaSocketLike } from "../ports/index";
import { EncryptedFileAuthStore } from "../adapters/encryptedFileAuthStore";

export type DisconnectDirective =
  | { action: "wipe_and_logged_out" }
  | { action: "recreate_immediately" }
  | { action: "pause_safety"; reason: string }
  | { action: "quarantine_and_error"; reason: string }
  | { action: "reconnect_backoff"; delayMs: number };

const BACKOFF_STEPS_SECONDS = [2, 5, 10, 20, 40, 60];

export function mapDisconnectCodeToDirective(
  code: number | undefined,
  attemptIndex: number,
  randomFn: () => number = Math.random,
): DisconnectDirective {
  if (code === 401) return { action: "wipe_and_logged_out" };
  if (code === 515) return { action: "recreate_immediately" };
  if (code === 440) return { action: "pause_safety", reason: "CONNECTION_REPLACED_440" };
  if (code === 403) return { action: "pause_safety", reason: "FORBIDDEN_403_SUSPECTED_RESTRICTION" };
  if (code === 500 || code === 411) return { action: "quarantine_and_error", reason: `BAD_SESSION_${code}` };
  const baseSec = BACKOFF_STEPS_SECONDS[Math.min(Math.max(0, attemptIndex), BACKOFF_STEPS_SECONDS.length - 1)];
  return { action: "reconnect_backoff", delayMs: Math.round(baseSec * 1000 * (0.8 + randomFn() * 0.4)) };
}

export interface ManagedSessionState {
  sessionKey: string;
  status: "disconnected" | "awaiting_qr" | "connecting" | "connected" | "reconnecting" | "logged_out" | "paused_safety" | "error";
  paused: boolean;
  qr: string | null;
  qrExpiresAt: string | null;
  phoneNumber: string | null;
  waJid: string | null;
  pushName: string | null;
  connectedAtMs: number | null;
  lastReconnectAtMs: number | null;
  reconnectAttempts: number;
  lastDisconnect: { code?: number; reason?: string; at: string } | null;
  socket: WaSocketLike | null;
}

export class SessionRuntime implements SessionRegistry {
  private readonly states = new Map<string, ManagedSessionState>();
  private readonly connecting = new Set<string>();

  constructor(
    private readonly authStore: EncryptedFileAuthStore,
    private readonly maxActiveSessions: number,
    private readonly logger: Logger,
    private readonly onStateChange: () => void,
  ) {}

  getOrCreateState(sessionKey: string): ManagedSessionState {
    let state = this.states.get(sessionKey);
    if (!state) {
      state = {
        sessionKey, status: "disconnected", paused: false, qr: null, qrExpiresAt: null,
        phoneNumber: null, waJid: null, pushName: null, connectedAtMs: null,
        lastReconnectAtMs: null, reconnectAttempts: 0, lastDisconnect: null, socket: null,
      };
      this.states.set(sessionKey, state);
    }
    return state;
  }

  getSocket(sessionKey: string): WaSocketLike | null {
    return this.states.get(sessionKey)?.socket ?? null;
  }

  isConnected(sessionKey: string): boolean {
    const state = this.states.get(sessionKey);
    return Boolean(state && state.status === "connected" && !state.paused && state.socket);
  }

  getAllReports(isSessionReady: (sessionKey: string) => boolean): Array<Record<string, unknown>> {
    return Array.from(this.states.values(), (state) => ({
      session_key: state.sessionKey,
      status: state.status,
      ready: state.status === "connected" && !state.paused && isSessionReady(state.sessionKey),
      qr: state.qr,
      qr_expires_at: state.qrExpiresAt,
      phone_number: state.phoneNumber,
      wa_jid: state.waJid,
      push_name: state.pushName,
      disconnect: state.lastDisconnect,
    }));
  }

  attachSocket(sessionKey: string, socket: WaSocketLike): void {
    const state = this.getOrCreateState(sessionKey);
    state.socket = socket;
    state.status = "connecting";
    this.connecting.delete(sessionKey);
    this.onStateChange();
  }

  updateConnection(sessionKey: string, update: {
    status?: ManagedSessionState["status"];
    qr?: string | null;
    qrExpiresAt?: string | null;
    phoneNumber?: string | null;
    waJid?: string | null;
    pushName?: string | null;
    disconnect?: { code?: number; reason?: string; at?: string } | null;
  }): void {
    const state = this.getOrCreateState(sessionKey);
    if (update.status) state.status = update.status;
    if (update.qr !== undefined) {
      state.qr = update.qr;
      state.qrExpiresAt = update.qr ? (update.qrExpiresAt ?? new Date(Date.now() + 60_000).toISOString()) : null;
    }
    if (update.phoneNumber !== undefined) state.phoneNumber = update.phoneNumber;
    if (update.waJid !== undefined) state.waJid = update.waJid;
    if (update.pushName !== undefined) state.pushName = update.pushName;
    if (update.disconnect !== undefined) {
      state.lastDisconnect = update.disconnect ? { ...update.disconnect, at: update.disconnect.at ?? new Date().toISOString() } : null;
    }
    if (update.status === "connected") {
      state.connectedAtMs = Date.now();
      state.qr = null;
      state.qrExpiresAt = null;
      state.reconnectAttempts = 0;
    }
    if (update.status === "disconnected" || update.status === "logged_out" || update.status === "error") {
      state.socket = null;
    }
    this.onStateChange();
  }

  async handleCommand(
    command: { session_key: string; action: string },
    connectSocket: (sessionKey: string) => Promise<WaSocketLike>,
  ): Promise<void> {
    const state = this.getOrCreateState(command.session_key);
    if (command.action === "pause") {
      state.paused = true;
      this.onStateChange();
      return;
    }
    if (command.action === "resume") {
      state.paused = false;
      this.onStateChange();
      return;
    }
    if (command.action === "disconnect" || command.action === "logout") {
      const existing = state.socket as (WaSocketLike & { end?: (error?: Error) => void }) | null;
      try { existing?.end?.(new Error(command.action.toUpperCase())); } catch { /* socket may already have ended */ }
      state.socket = null;
      state.qr = null;
      state.qrExpiresAt = null;
      state.status = command.action === "logout" ? "logged_out" : "disconnected";
      if (command.action === "logout") await this.authStore.wipeSession(command.session_key);
      this.onStateChange();
      return;
    }
    if (command.action !== "connect" && command.action !== "refresh_qr") return;
    if ((command.action === "refresh_qr" || (command.action === "connect" && state.status === "awaiting_qr")) && state.socket) {
      const staleSocket = state.socket as (WaSocketLike & { end?: (error?: Error) => void });
      try { staleSocket.end?.(new Error("QR_REFRESH")); } catch { /* socket may already be closed */ }
      state.socket = null;
      state.qr = null;
      state.qrExpiresAt = null;
    }
    if (this.connecting.has(command.session_key) || state.socket) return;

    const activeCount = Array.from(this.states.values()).filter(
      (candidate) => candidate.sessionKey !== command.session_key &&
        candidate.socket !== null && candidate.status !== "disconnected" &&
        candidate.status !== "logged_out",
    ).length;
    if (activeCount >= this.maxActiveSessions) {
      this.updateConnection(command.session_key, {
        status: "disconnected",
        disconnect: { code: 503, reason: "CAPACITY" },
      });
      this.logger.warn("Session connect refused: MAX_ACTIVE_SESSIONS reached", {
        sessionKey: command.session_key, maxActiveSessions: this.maxActiveSessions,
      });
      return;
    }

    this.connecting.add(command.session_key);
    state.paused = false;
    state.status = "connecting";
    state.qr = null;
    this.onStateChange();
    try {
      const socket = await connectSocket(command.session_key);
      this.attachSocket(command.session_key, socket);
    } catch (err) {
      this.connecting.delete(command.session_key);
      this.updateConnection(command.session_key, {
        status: "error",
        disconnect: { reason: err instanceof Error ? err.message : String(err) },
      });
      throw err;
    }
  }
}
