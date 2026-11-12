export interface WaSocketLike {
  sendMessage(
    jid: string,
    content: Record<string, unknown>,
    options?: Record<string, unknown>,
  ): Promise<{ key?: { id?: string } } | undefined>;
  sendPresenceUpdate?(type: "available" | "composing" | "paused", jid?: string): Promise<void>;
  onWhatsApp?(...jids: string[]): Promise<Array<{ jid: string; exists: boolean }> | undefined>;
}

export interface AuthStateStore {
  loadSessionCredentials(sessionKey: string): Promise<Record<string, unknown> | null>;
  saveSessionCredentials(sessionKey: string, creds: Record<string, unknown>): Promise<void>;
  loadKey(sessionKey: string, category: string, id: string): Promise<unknown | null>;
  saveKey(sessionKey: string, category: string, id: string, value: unknown | null): Promise<void>;
  wipeSession(sessionKey: string): Promise<void>;
}

export interface ContactJidStore {
  getResolvedJid(phone10: string): string | null;
  setResolvedJid(phone10: string, jid: string): void;
}

export interface AntispamState {
  canSendNow(sessionKey: string, nowMs: number): { allowed: boolean; reason?: string; waitMs?: number };
  recordSend(sessionKey: string, nowMs: number): void;
}

export interface AutoReplyRule {
  id: string;
  matchType: "exact" | "contains" | "starts_with";
  keywords: string[];
  replyKind: "text" | "location" | "media" | "library_item";
  replyText?: string;
  priority: number;
}

export interface AutoReplyRuleSource {
  getRulesForSession(sessionKey: string): Promise<AutoReplyRule[]>;
}

export interface MessageLog {
  recordLocalSendAttempt(entry: {
    sessionKey: string;
    queueId: string;
    attemptId: string;
    providerMessageId?: string;
    sentAtMs: number;
  }): void;
}

export interface SessionRegistry {
  getSocket(sessionKey: string): WaSocketLike | null;
  isConnected(sessionKey: string): boolean;
}

export interface InboundEvent {
  event_id: string;
  type: "message" | "status" | "probe";
  session_key: string;
  at: string;
  provider_message_id?: string;
  sender?: {
    jid: string;
    lid?: string;
    phone_e164?: string;
    push_name?: string;
  };
  content?: {
    type: string;
    text?: string;
    media?: Record<string, unknown>;
    location?: Record<string, unknown>;
  };
  status?: "sent" | "delivered" | "read" | "failed";
  phone_hash?: string;
}

export interface EventSink {
  enqueue(event: InboundEvent): Promise<void>;
}

export interface Clock {
  nowMs(): number;
  setServerOffsetMs(offsetMs: number): void;
}

export interface Logger {
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
}
