import type {
  AntispamState,
  Clock,
  ContactJidStore,
  Logger,
  MessageLog,
  SessionRegistry,
} from "../../src/ports/index";
import { formatPhoneToJid } from "./jid-utils";

export interface SendTextInput {
  sessionKey: string;
  queueId: string;
  attemptId: string;
  recipient: string;
  text: string;
}

export interface SendMediaInput {
  sessionKey: string;
  queueId: string;
  attemptId: string;
  recipient: string;
  buffer: Buffer;
  mime: string;
  filename: string;
  caption?: string;
  jpegThumbnail?: Buffer;
}

export interface SendLocationInput {
  sessionKey: string;
  queueId: string;
  attemptId: string;
  recipient: string;
  lat: number;
  lng: number;
  name?: string;
  address?: string;
}

/**
 * Vendored WA-AKG chat.service.ts behind clean ports (ADR-0004 & Sec 9.2).
 * Preserves text, media (PDF/image/document), native location pins, and number check.
 */
export class WaChatService {
  constructor(
    private readonly sessions: SessionRegistry,
    private readonly contacts: ContactJidStore,
    private readonly antispam: AntispamState,
    private readonly messageLog: MessageLog,
    private readonly clock: Clock,
    private readonly logger: Logger,
  ) {}

  private ensureReadySocket(sessionKey: string) {
    const sock = this.sessions.getSocket(sessionKey);
    if (!sock || !this.sessions.isConnected(sessionKey)) {
      throw new Error("SESSION_NOT_CONNECTED");
    }

    const nowMs = this.clock.nowMs();
    const check = this.antispam.canSendNow(sessionKey, nowMs);
    if (!check.allowed) {
      throw new Error(check.reason ?? "LOCAL_ANTISPAM_BLOCKED");
    }

    return { sock, nowMs };
  }

  async checkNumberOnWhatsApp(
    sessionKey: string,
    rawPhone: string,
  ): Promise<{ exists: boolean; jid: string }> {
    const sock = this.sessions.getSocket(sessionKey);
    if (!sock || !this.sessions.isConnected(sessionKey)) {
      throw new Error("SESSION_NOT_CONNECTED");
    }

    const candidateJid = formatPhoneToJid(rawPhone, this.contacts);
    if (!sock.onWhatsApp) {
      return { exists: true, jid: candidateJid };
    }

    const results = await sock.onWhatsApp(candidateJid);
    const first = results?.[0];
    if (first?.exists && first.jid) {
      const phone10 = candidateJid.slice(2, 12);
      this.contacts.setResolvedJid(phone10, first.jid);
      return { exists: true, jid: first.jid };
    }

    return { exists: false, jid: candidateJid };
  }

  async sendText(input: SendTextInput): Promise<{ providerMessageId: string; jid: string }> {
    const { sock, nowMs } = this.ensureReadySocket(input.sessionKey);
    const jid = formatPhoneToJid(input.recipient, this.contacts);

    const response = await sock.sendMessage(jid, { text: input.text });
    const providerMessageId = response?.key?.id;
    if (!providerMessageId) {
      throw new Error("OUTCOME_UNKNOWN: Missing provider message id from socket");
    }

    this.antispam.recordSend(input.sessionKey, nowMs);
    this.messageLog.recordLocalSendAttempt({
      sessionKey: input.sessionKey,
      queueId: input.queueId,
      attemptId: input.attemptId,
      providerMessageId,
      sentAtMs: nowMs,
    });

    return { providerMessageId, jid };
  }

  async sendMedia(input: SendMediaInput): Promise<{ providerMessageId: string; jid: string }> {
    const { sock, nowMs } = this.ensureReadySocket(input.sessionKey);
    const jid = formatPhoneToJid(input.recipient, this.contacts);

    const isImage = input.mime.startsWith("image/");
    const payload: Record<string, unknown> = isImage
      ? {
          image: input.buffer,
          caption: input.caption ?? "",
          mimetype: input.mime,
          ...(input.jpegThumbnail ? { jpegThumbnail: input.jpegThumbnail } : {}),
        }
      : {
          document: input.buffer,
          fileName: input.filename,
          mimetype: input.mime,
          caption: input.caption ?? "",
        };

    const response = await sock.sendMessage(jid, payload);
    const providerMessageId = response?.key?.id;
    if (!providerMessageId) {
      throw new Error("OUTCOME_UNKNOWN: Missing provider message id from media send");
    }

    this.antispam.recordSend(input.sessionKey, nowMs);
    this.messageLog.recordLocalSendAttempt({
      sessionKey: input.sessionKey,
      queueId: input.queueId,
      attemptId: input.attemptId,
      providerMessageId,
      sentAtMs: nowMs,
    });

    return { providerMessageId, jid };
  }

  async sendLocation(input: SendLocationInput): Promise<{ providerMessageId: string; jid: string }> {
    const { sock, nowMs } = this.ensureReadySocket(input.sessionKey);
    const jid = formatPhoneToJid(input.recipient, this.contacts);

    const response = await sock.sendMessage(jid, {
      location: {
        degreesLatitude: input.lat,
        degreesLongitude: input.lng,
        name: input.name ?? "",
        address: input.address ?? "",
      },
    });

    const providerMessageId = response?.key?.id;
    if (!providerMessageId) {
      throw new Error("OUTCOME_UNKNOWN: Missing provider message id from location send");
    }

    this.antispam.recordSend(input.sessionKey, nowMs);
    this.messageLog.recordLocalSendAttempt({
      sessionKey: input.sessionKey,
      queueId: input.queueId,
      attemptId: input.attemptId,
      providerMessageId,
      sentAtMs: nowMs,
    });

    return { providerMessageId, jid };
  }
}
