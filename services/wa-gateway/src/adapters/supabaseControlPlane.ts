import type { Clock, Logger } from "../ports/index";

export interface ControlPlaneFlags {
  module_enabled: boolean;
  kill_switch: boolean;
  inbound_logging_enabled: boolean;
  lead_pool_enabled: boolean;
  auto_reply_enabled: boolean;
  check_numbers_before_bulk: boolean;
  interactive_enabled: boolean;
  pace_min_seconds: number;
  pace_max_seconds: number;
}

export interface ClaimedQueueItem {
  queue_id: string;
  attempt_id: string;
  session_key: string;
  recipient_phone: string;
  recipient_jid?: string | null;
  message_type: "text" | "media" | "location" | "interactive";
  body?: string | null;
  location?: {
    lat: number;
    lng: number;
    name?: string;
    address?: string;
  } | null;
  media?: {
    signed_url?: string | null;
    mime?: string;
    filename?: string;
    size_bytes?: number;
    sha256?: string;
  } | null;
}

export interface SyncResponseData {
  server_time_ms: number;
  flags: ControlPlaneFlags;
  commands: Array<{ session_key: string; action: string }>;
  items: ClaimedQueueItem[];
  acks: string[];
}

export class SystemClock implements Clock {
  private offsetMs = 0;

  nowMs(): number {
    return Date.now() + this.offsetMs;
  }

  setServerOffsetMs(offsetMs: number): void {
    this.offsetMs = offsetMs;
  }

  getOffsetMs(): number {
    return this.offsetMs;
  }
}

export class SupabaseControlPlane {
  private readonly workerEndpoint: string;

  constructor(
    supabaseUrl: string,
    private readonly workerId: string,
    private readonly workerSecret: string,
    private readonly clock: SystemClock,
    private readonly logger: Logger,
  ) {
    this.workerEndpoint = `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/whatsapp-worker`;
  }

  private async postWorker<T>(payload: Record<string, unknown>): Promise<T> {
    const res = await fetch(this.workerEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Worker-Id": this.workerId,
        "X-Worker-Secret": this.workerSecret,
        "X-Worker-Timestamp": String(this.clock.nowMs()),
      },
      body: JSON.stringify(payload),
    });

    const json = (await res.json().catch(() => null)) as
      | { ok: boolean; data?: T; error?: { code: string; message: string } }
      | null;

    if (!res.ok || !json?.ok || !json.data) {
      throw new Error(
        `CONTROL_PLANE_${res.status}: ${json?.error?.code ?? "HTTP_ERROR"} - ${json?.error?.message ?? res.statusText}`,
      );
    }

    return json.data;
  }

  async hello(meta: {
    appEnv: "production" | "preview";
    version: string;
    buildSha?: string;
    hostLabel: string;
  }): Promise<{
    server_time_ms: number;
    flags: ControlPlaneFlags;
    probe_salt: string;
    doorbell_channel: string;
  }> {
    const localBefore = Date.now();
    const data = await this.postWorker<{
      server_time_ms: number;
      flags: ControlPlaneFlags;
      probe_salt: string;
      doorbell_channel: string;
    }>({
      action: "hello",
      app_env: meta.appEnv,
      version: meta.version,
      build_sha: meta.buildSha,
      host_label: meta.hostLabel,
    });

    const rttHalf = Math.round((Date.now() - localBefore) / 2);
    const skewMs = data.server_time_ms - (localBefore + rttHalf);
    this.clock.setServerOffsetMs(skewMs);

    if (Math.abs(skewMs) > 60_000) {
      this.logger.warn("Host clock skew exceeds 60s; applied server offset correction", {
        skewSeconds: Math.round(skewMs / 1000),
      });
    }

    return data;
  }

  async sync(payload: {
    sessions: Array<Record<string, unknown>>;
    results: Array<Record<string, unknown>>;
    stats: Record<string, unknown>;
  }): Promise<SyncResponseData> {
    const data = await this.postWorker<SyncResponseData>({
      action: "sync",
      sessions: payload.sessions,
      results: payload.results,
      stats: payload.stats,
    });

    if (typeof data.server_time_ms === "number") {
      this.clock.setServerOffsetMs(data.server_time_ms - Date.now());
    }

    return data;
  }

  async janitor(): Promise<{ staging_deleted: number; at: string }> {
    return await this.postWorker<{ staging_deleted: number; at: string }>({
      action: "janitor",
    });
  }
}