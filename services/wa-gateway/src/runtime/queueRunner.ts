import type { ClaimedQueueItem } from "../adapters/supabaseControlPlane";
import type { WaChatService } from "../../vendor/wa-akg/chat.service";
import { fetchSignedMediaBuffer } from "./mediaFetcher";

export interface PacingConfig {
  paceMinSeconds: number;
  paceMaxSeconds: number;
}

export type TypingPresence = (
  sessionKey: string,
  recipient: string,
  durationMs: number,
) => Promise<void>;

/**
 * Computes randomized inter-send gap (15-35s uniform + 60-180s rest every 10-15 sends) (Sec 9.6).
 */
export function computeNextSendGapMs(
  config: PacingConfig,
  sendsInCurrentBurst: number,
  randomFn: () => number = Math.random,
): { gapMs: number; resetBurst: boolean } {
  const minMs = Math.max(5_000, config.paceMinSeconds * 1000);
  const maxMs = Math.max(minMs, config.paceMaxSeconds * 1000);
  const baseGapMs = Math.round(minMs + randomFn() * (maxMs - minMs));

  const burstThreshold = 10 + Math.floor(randomFn() * 6);
  if (sendsInCurrentBurst >= burstThreshold) {
    const extraRestMs = Math.round((60 + randomFn() * 120) * 1000);
    return { gapMs: baseGapMs + extraRestMs, resetBurst: true };
  }

  return { gapMs: baseGapMs, resetBurst: false };
}

/**
 * Computes human-like typing presence duration (2 to 6 seconds scaled to text length) (Sec 9.6).
 */
export function computeComposingDelayMs(textLength: number): number {
  const scaled = 2_000 + Math.min(4_000, Math.round((textLength / 200) * 4_000));
  return Math.max(2_000, Math.min(6_000, scaled));
}

export class QueueRunner {
  private readonly inFlightSessions = new Set<string>();
  private readonly nextReadyAtBySession = new Map<string, number>();
  private readonly burstCountBySession = new Map<string, number>();

  constructor(
    private readonly chatService: WaChatService,
    private readonly randomFn: () => number = Math.random,
    private readonly typing: TypingPresence = async () => {},
  ) {}

  isSessionReadyForClaim(sessionKey: string, nowMs = Date.now()): boolean {
    if (this.inFlightSessions.has(sessionKey)) {
      return false;
    }
    const nextReadyAt = this.nextReadyAtBySession.get(sessionKey) ?? 0;
    return nowMs >= nextReadyAt;
  }

  isBusy(nowMs = Date.now()): boolean {
    if (this.inFlightSessions.size > 0) return true;
    for (const readyAt of this.nextReadyAtBySession.values()) {
      if (readyAt > nowMs) return true;
    }
    return false;
  }

  async executeClaimedItem(
    item: ClaimedQueueItem,
    flags: { kill_switch: boolean; pace_min_seconds: number; pace_max_seconds: number },
  ): Promise<{
    queue_id: string;
    attempt_id: string;
    outcome: {
      status: "sent" | "failed" | "deferred" | "unknown";
      provider_message_id?: string;
      recipient_jid?: string;
      sent_at?: string;
      error_code?: string;
      error_message?: string;
    };
  }> {
    const sessionKey = item.session_key;
    this.inFlightSessions.add(sessionKey);
    let socketCallStarted = false;

    try {
      if (flags.kill_switch) {
        return {
          queue_id: item.queue_id,
          attempt_id: item.attempt_id,
          outcome: {
            status: "deferred",
            error_code: "KILL_SWITCH",
            error_message: "Kill switch activated before socket send",
          },
        };
      }

      const recipient = item.recipient_jid || item.recipient_phone;
      let sendRes: { providerMessageId: string; jid: string };

      if (item.message_type === "location") {
        if (
          !item.location ||
          typeof item.location.lat !== "number" ||
          typeof item.location.lng !== "number"
        ) {
          return {
            queue_id: item.queue_id,
            attempt_id: item.attempt_id,
            outcome: {
              status: "failed",
              error_code: "LOCATION_INVALID",
              error_message: "Location message is missing valid coordinates",
            },
          };
        }
        socketCallStarted = true;
        sendRes = await this.chatService.sendLocation({
          sessionKey,
          queueId: item.queue_id,
          attemptId: item.attempt_id,
          recipient,
          lat: item.location.lat,
          lng: item.location.lng,
          name: item.location.name,
          address: item.location.address,
        });
      } else if (item.message_type === "media") {
        if (!item.media?.signed_url) {
          return {
            queue_id: item.queue_id,
            attempt_id: item.attempt_id,
            outcome: {
              status: "failed",
              error_code: "MEDIA_INVALID",
              error_message: "Media message is missing a valid signed download URL",
            },
          };
        }
        const mediaMime = item.media.mime ?? "application/pdf";
        const mediaBuffer = await fetchSignedMediaBuffer(item.media.signed_url, mediaMime);
        socketCallStarted = true;
        sendRes = await this.chatService.sendMedia({
          sessionKey,
          queueId: item.queue_id,
          attemptId: item.attempt_id,
          recipient,
          buffer: mediaBuffer,
          mime: mediaMime,
          filename: item.media.filename ?? "document.pdf",
          caption: item.body ?? "",
        });
      } else {
        const textBody = item.body ?? "";
        await this.typing(sessionKey, recipient, computeComposingDelayMs(textBody.length));
        socketCallStarted = true;
        sendRes = await this.chatService.sendText({
          sessionKey,
          queueId: item.queue_id,
          attemptId: item.attempt_id,
          recipient,
          text: textBody,
        });
      }

      const currentBurst = (this.burstCountBySession.get(sessionKey) ?? 0) + 1;
      const { gapMs, resetBurst } = computeNextSendGapMs(
        {
          paceMinSeconds: flags.pace_min_seconds,
          paceMaxSeconds: flags.pace_max_seconds,
        },
        currentBurst,
        this.randomFn,
      );

      this.burstCountBySession.set(sessionKey, resetBurst ? 0 : currentBurst);
      this.nextReadyAtBySession.set(sessionKey, Date.now() + gapMs);

      return {
        queue_id: item.queue_id,
        attempt_id: item.attempt_id,
        outcome: {
          status: "sent",
          provider_message_id: sendRes.providerMessageId,
          recipient_jid: sendRes.jid,
          sent_at: new Date().toISOString(),
        },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (
        msg.includes("MEDIA_URL_INVALID") ||
        msg.includes("MEDIA_MIME_INVALID") ||
        msg.includes("MEDIA_MIME_MISMATCH") ||
        msg.includes("MEDIA_TOO_LARGE") ||
        msg.includes("MEDIA_EMPTY")
      ) {
        return {
          queue_id: item.queue_id,
          attempt_id: item.attempt_id,
          outcome: {
            status: "failed",
            error_code: "MEDIA_INVALID",
            error_message: msg,
          },
        };
      }

      if (msg.includes("MEDIA_DOWNLOAD_FAILED") || msg.includes("MEDIA_DOWNLOAD_TIMEOUT")) {
        return {
          queue_id: item.queue_id,
          attempt_id: item.attempt_id,
          outcome: {
            status: "deferred",
            error_code: "MEDIA_DOWNLOAD_FAILED",
            error_message: msg,
          },
        };
      }

      if (
        msg.includes("SESSION_NOT_CONNECTED") ||
        msg.includes("LOCAL_MIN_INTERVAL_WAIT") ||
        msg.includes("LOCAL_DAILY_CEILING_REACHED") ||
        !socketCallStarted
      ) {
        return {
          queue_id: item.queue_id,
          attempt_id: item.attempt_id,
          outcome: {
            status: "deferred",
            error_code: "SESSION_NOT_READY",
            error_message: msg,
          },
        };
      }

      if (msg.includes("PHONE_INVALID") || msg.includes("NOT_ON_WHATSAPP")) {
        return {
          queue_id: item.queue_id,
          attempt_id: item.attempt_id,
          outcome: {
            status: "failed",
            error_code: "NOT_ON_WHATSAPP",
            error_message: msg,
          },
        };
      }

      return {
        queue_id: item.queue_id,
        attempt_id: item.attempt_id,
        outcome: {
          status: "unknown",
          error_code: "OUTCOME_UNKNOWN",
          error_message: msg,
        },
      };
    } finally {
      this.inFlightSessions.delete(sessionKey);
    }
  }
}