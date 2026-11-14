import { createClient, RealtimeChannel } from "@supabase/supabase-js";
import type { Logger } from "../ports/index";

/**
 * Adaptive polling & Realtime broadcast doorbell subscriber (ADR-0005 & Sec 9.7).
 * - Coalesces wake signals to at most 1 sync per second.
 * - Adaptive poll intervals: 60s with healthy doorbell, 30s without doorbell,
 *   10s while pairing or sending, 120s when idle.
 */
export function computeAdaptivePollIntervalMs(state: {
  doorbellHealthy: boolean;
  isPairingOrSending: boolean;
  hasActiveOrWantedSessions: boolean;
}): number {
  if (state.isPairingOrSending) {
    return 10_000;
  }
  if (!state.hasActiveOrWantedSessions) {
    return 120_000;
  }
  return state.doorbellHealthy ? 60_000 : 30_000;
}

export class DoorbellClient {
  private channel: RealtimeChannel | null = null;
  private healthy = false;
  private lastHealthyAtMs = Date.now();
  private lastWakeSyncAtMs = 0;
  private pendingWakeTimer: NodeJS.Timeout | null = null;

  constructor(
    supabaseUrl: string,
    publishableKey: string,
    private readonly channelName: string,
    private readonly onWake: () => void,
    private readonly logger: Logger,
  ) {
    const client = createClient(supabaseUrl, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    this.channel = client.channel(this.channelName);
  }

  start(): void {
    if (!this.channel) return;
    this.channel
      .on("broadcast", { event: "wake" }, () => {
        this.scheduleCoalescedWake();
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          this.healthy = true;
          this.lastHealthyAtMs = Date.now();
          this.logger.info("Doorbell channel subscribed", { channel: this.channelName });
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          this.healthy = false;
          this.logger.warn("Doorbell channel degraded; using 30s fallback polling", { status });
        }
      });
  }

  private scheduleCoalescedWake(): void {
    const now = Date.now();
    const elapsed = now - this.lastWakeSyncAtMs;
    if (elapsed >= 1_000) {
      this.lastWakeSyncAtMs = now;
      this.onWake();
      return;
    }
    if (!this.pendingWakeTimer) {
      this.pendingWakeTimer = setTimeout(() => {
        this.pendingWakeTimer = null;
        this.lastWakeSyncAtMs = Date.now();
        this.onWake();
      }, 1_000 - elapsed);
    }
  }

  isHealthy(): boolean {
    return this.healthy;
  }

  isDownOverOneHour(): boolean {
    return !this.healthy && Date.now() - this.lastHealthyAtMs > 3600_000;
  }

  stop(): void {
    if (this.pendingWakeTimer) {
      clearTimeout(this.pendingWakeTimer);
      this.pendingWakeTimer = null;
    }
    if (this.channel) {
      this.channel.unsubscribe();
      this.channel = null;
    }
  }
}