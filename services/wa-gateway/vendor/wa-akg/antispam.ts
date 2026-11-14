import type { AntispamState } from "../../src/ports/index";

export interface LocalAntispamOptions {
  minIntervalMs?: number;
  dailyCeiling?: number;
}

interface SessionWindow {
  dayKey: string;
  countToday: number;
  lastSentAtMs: number;
}

/**
 * Local in-memory safety net ported from WA-AKG antispam.ts (Sec 9.2).
 * Enforces at most 1 message per 10 seconds per session and 200 messages/day
 * independently of the authoritative Postgres rails.
 */
export class InMemoryAntispamState implements AntispamState {
  private readonly minIntervalMs: number;
  private readonly dailyCeiling: number;
  private readonly sessions = new Map<string, SessionWindow>();

  constructor(options: LocalAntispamOptions = {}) {
    this.minIntervalMs = options.minIntervalMs ?? 10_000;
    this.dailyCeiling = options.dailyCeiling ?? 200;
  }

  private toIstDayKey(nowMs: number): string {
    const istOffsetMs = 5.5 * 60 * 60 * 1000;
    return new Date(nowMs + istOffsetMs).toISOString().slice(0, 10);
  }

  canSendNow(
    sessionKey: string,
    nowMs: number,
  ): { allowed: boolean; reason?: string; waitMs?: number } {
    const dayKey = this.toIstDayKey(nowMs);
    const current = this.sessions.get(sessionKey);

    if (!current || current.dayKey !== dayKey) {
      return { allowed: true };
    }

    if (current.countToday >= this.dailyCeiling) {
      return {
        allowed: false,
        reason: "LOCAL_DAILY_CEILING_REACHED",
      };
    }

    const elapsed = nowMs - current.lastSentAtMs;
    if (elapsed < this.minIntervalMs) {
      return {
        allowed: false,
        reason: "LOCAL_MIN_INTERVAL_WAIT",
        waitMs: this.minIntervalMs - elapsed,
      };
    }

    return { allowed: true };
  }

  recordSend(sessionKey: string, nowMs: number): void {
    const dayKey = this.toIstDayKey(nowMs);
    const current = this.sessions.get(sessionKey);

    if (!current || current.dayKey !== dayKey) {
      this.sessions.set(sessionKey, {
        dayKey,
        countToday: 1,
        lastSentAtMs: nowMs,
      });
      return;
    }

    current.countToday += 1;
    current.lastSentAtMs = nowMs;
  }
}
