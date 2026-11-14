import QRCode from "https://esm.sh/qrcode@1.5.4?target=deno";

import {
  authenticateWorkerRequest,
  corsHeaders,
  createServiceClient,
  jsonErr,
  jsonOk,
} from "../_shared/whatsappAuth.ts";

interface WorkerSessionReport {
  session_key: string;
  status: string;
  ready?: boolean;
  qr?: string | null;
  qr_expires_at?: string | null;
  phone_number?: string | null;
  wa_jid?: string | null;
  push_name?: string | null;
  disconnect?: {
    code?: number;
    reason?: string;
    at?: string;
  } | null;
}

interface WorkerResultReport {
  queue_id: string;
  attempt_id: string;
  outcome: {
    status: "sent" | "failed" | "deferred" | "unknown";
    provider_message_id?: string;
    recipient_jid?: string;
    sent_at?: string;
    error_code?: string;
    error_message?: string;
    retry_after_seconds?: number;
  };
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonErr("METHOD_NOT_ALLOWED", "POST required", 405);
  }

  try {
    const adminClient = createServiceClient();
    const authResult = await authenticateWorkerRequest(req, adminClient);
    if (!authResult.ok) {
      return authResult.response;
    }
    const { workerId } = authResult;

    const body = await req.json().catch(() => ({}));
    const action = body.action as "hello" | "sync" | "janitor";

    const { data: settings } = await adminClient
      .from("whatsapp_settings")
      .select("*")
      .limit(1)
      .single();

    const flags = {
      module_enabled: Boolean(settings?.module_enabled),
      kill_switch: Boolean(settings?.kill_switch),
      inbound_logging_enabled: Boolean(settings?.inbound_logging_enabled),
      lead_pool_enabled: Boolean(settings?.lead_pool_enabled),
      auto_reply_enabled: Boolean(settings?.auto_reply_enabled),
      check_numbers_before_bulk: Boolean(settings?.check_numbers_before_bulk),
      interactive_enabled: Boolean(settings?.interactive_enabled),
      pace_min_seconds: Number(settings?.pace_min_seconds ?? 15),
      pace_max_seconds: Number(settings?.pace_max_seconds ?? 35),
    };

    if (action === "hello") {
      await adminClient.rpc("wa_expire_leases");

      const appEnv = body.app_env === "production" ? "production" : "preview";
      await adminClient.from("whatsapp_worker_instances").upsert(
        {
          worker_id: workerId,
          app_env: appEnv,
          version: body.version ? String(body.version) : "2.0.0",
          build_sha: body.build_sha ? String(body.build_sha) : null,
          host_label: body.host_label ? String(body.host_label) : null,
          started_at: new Date().toISOString(),
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: "worker_id" },
      );

      return jsonOk({
        server_time_ms: Date.now(),
        flags,
        probe_salt: Deno.env.get("WA_PROBE_SALT") ?? "wa-default-probe-salt",
        doorbell_channel: `wa-gateway-${appEnv}`,
        poll_intervals_seconds: {
          healthy_doorbell: 60,
          degraded_doorbell: 30,
          active_pairing_or_sending: 10,
          idle: 120,
        },
      });
    }

    if (action === "sync") {
      // 1. Expire any stale sending leases first (Sec 7.6)
      await adminClient.rpc("wa_expire_leases");

      // 2. Process reported queue results first so acks and session states are fresh
      const reportedResults: WorkerResultReport[] = Array.isArray(body.results) ? body.results : [];
      const acks: string[] = [];

      for (const res of reportedResults) {
        if (!res?.queue_id || !res?.attempt_id || !res?.outcome) continue;
        const { data: rpcData, error: rpcErr } = await adminClient.rpc("wa_report_result", {
          p_queue_id: res.queue_id,
          p_attempt_id: res.attempt_id,
          p_outcome: res.outcome,
        });
        if (!rpcErr && rpcData?.acked) {
          acks.push(res.queue_id);
        }
      }

      // 3. Apply session status/QR updates from worker
      const reportedSessions: WorkerSessionReport[] = Array.isArray(body.sessions) ? body.sessions : [];
      const readySessionKeys = new Set<string>();

      for (const s of reportedSessions) {
        if (!s?.session_key) continue;
        if (s.ready && s.status === "connected") {
          readySessionKeys.add(s.session_key);
        }

        const { data: existing } = await adminClient
          .from("whatsapp_sessions")
          .select("id, status, desired_state, warmup_started_at, paused")
          .eq("session_key", s.session_key)
          .maybeSingle();

        if (!existing) continue;

        const updatePayload: Record<string, unknown> = {
          worker_instance_id: workerId,
          updated_at: new Date().toISOString(),
        };

        // Do not overwrite pairing_requested if the user just clicked Connect and worker hasn't started QR yet
        if (
          existing.status === "pairing_requested" &&
          s.status === "disconnected" &&
          existing.desired_state === "connected"
        ) {
          // Keep pairing_requested so command 'connect' is issued below
        } else {
          updatePayload.status = s.status;
        }

        if (s.status === "connected") {
          updatePayload.qr_payload = null;
          updatePayload.qr_expires_at = null;
          updatePayload.connected_at = new Date().toISOString();
          if (!existing.warmup_started_at) {
            updatePayload.warmup_started_at = new Date().toISOString();
          }
        } else if (s.qr) {
          updatePayload.status = "awaiting_qr";
          const qrSvg = s.qr.startsWith("data:image/") ? null : await QRCode.toString(s.qr, { type: "svg", width: 320, margin: 1 });
          updatePayload.qr_payload = s.qr.startsWith("data:image/") ? s.qr : `data:image/svg+xml;base64,${btoa(qrSvg ?? "")}`;
          updatePayload.qr_updated_at = new Date().toISOString();
          updatePayload.qr_expires_at = s.qr_expires_at ?? new Date(Date.now() + 60_000).toISOString();
        } else if (s.status === "disconnected" || s.status === "logged_out") {
          updatePayload.qr_payload = null;
          updatePayload.qr_expires_at = null;
        }

        if (s.phone_number !== undefined) updatePayload.phone_number = s.phone_number;
        if (s.wa_jid !== undefined) updatePayload.wa_jid = s.wa_jid;
        if (s.push_name !== undefined) updatePayload.push_name = s.push_name;

        if (s.disconnect) {
          updatePayload.last_disconnect_code = s.disconnect.code ?? null;
          updatePayload.last_disconnect_reason = s.disconnect.reason ?? null;
          updatePayload.last_disconnect_at = s.disconnect.at ?? new Date().toISOString();
        }

        await adminClient
          .from("whatsapp_sessions")
          .update(updatePayload)
          .eq("id", existing.id);
      }

      // 4. Update worker heartbeat stats
      const stats = body.stats ?? {};
      await adminClient
        .from("whatsapp_worker_instances")
        .upsert(
          {
            worker_id: workerId,
            app_env: Deno.env.get("WA_ENV") === "production" ? "production" : "preview",
            last_seen_at: new Date().toISOString(),
            rss_mb: typeof stats.rss_mb === "number" ? Math.round(stats.rss_mb) : null,
            uptime_s: typeof stats.uptime_s === "number" ? Math.round(stats.uptime_s) : null,
            spool_depth: typeof stats.spool_depth === "number" ? Math.round(stats.spool_depth) : 0,
            sessions: reportedSessions.map((rs) => ({
              session_key: rs.session_key,
              status: rs.status,
            })),
            last_error: typeof stats.last_error === "string" ? stats.last_error : null,
          },
          { onConflict: "worker_id" },
        );

      // 5. Compute session commands (connect, disconnect, logout, pause, resume)
      // Also auto-logout personal sessions whose owner profile has is_active = false (Sec 8.4)
      const { data: allSessions } = await adminClient
        .from("whatsapp_sessions")
        .select("*");

      const commands: Array<{ session_key: string; action: string }> = [];
      const workerStateByKey = new Map<string, WorkerSessionReport>(
        reportedSessions.map((rs) => [rs.session_key, rs]),
      );

      for (const dbSess of allSessions ?? []) {
        const sKey = String(dbSess.session_key);
        const wSess = workerStateByKey.get(sKey);

        if (dbSess.slot === "personal" && dbSess.owner_user_id) {
          const { data: prof } = await adminClient
            .from("profiles")
            .select("is_active")
            .or(`id.eq.${dbSess.owner_user_id},user_id.eq.${dbSess.owner_user_id}`)
            .maybeSingle();

          if (prof && prof.is_active === false && dbSess.desired_state !== "logged_out") {
            await adminClient
              .from("whatsapp_sessions")
              .update({
                desired_state: "logged_out",
                status: "logged_out",
                qr_payload: null,
                updated_at: new Date().toISOString(),
              })
              .eq("id", dbSess.id);
            commands.push({ session_key: sKey, action: "logout" });
            continue;
          }
        }

        if (dbSess.desired_state === "logged_out") {
          if (wSess && wSess.status !== "disconnected" && wSess.status !== "logged_out") {
            commands.push({ session_key: sKey, action: "logout" });
          } else if (dbSess.status === "logged_out") {
            await adminClient
              .from("whatsapp_sessions")
              .update({ desired_state: "disconnected", status: "disconnected" })
              .eq("id", dbSess.id);
          }
        } else if (dbSess.desired_state === "disconnected") {
          if (wSess && wSess.status !== "disconnected") {
            commands.push({ session_key: sKey, action: "disconnect" });
          }
        } else if (dbSess.desired_state === "connected") {
          if (dbSess.paused) {
            commands.push({ session_key: sKey, action: "pause" });
          } else if (
            dbSess.status === "pairing_requested" ||
            !wSess ||
            wSess.status === "disconnected"
          ) {
            commands.push({ session_key: sKey, action: "connect" });
          }
        }
      }

      // 6. Claim at most one queue item per ready session (Sec 8.4)
      const items: Array<Record<string, unknown>> = [];

      if (flags.module_enabled && !flags.kill_switch) {
        for (const dbSess of allSessions ?? []) {
          const sKey = String(dbSess.session_key);
          if (!readySessionKeys.has(sKey) || dbSess.paused || dbSess.status !== "connected") {
            continue;
          }

          const { data: claimed } = await adminClient.rpc("wa_claim_next", {
            p_worker_id: workerId,
            p_session_id: dbSess.id,
          });

          if (!claimed || !claimed.queue_id) continue;

          // If media_ref has a storage path, generate a 15-minute signed URL (ADR-0008)
          let mediaPayload: Record<string, unknown> | null = null;
          if (claimed.media_ref && typeof claimed.media_ref === "object") {
            const mediaRef = claimed.media_ref as Record<string, unknown>;
            if (typeof mediaRef.path === "string" && mediaRef.path.length > 0) {
              const bucket = typeof mediaRef.bucket === "string" ? mediaRef.bucket : "crm-attachments";
              const { data: signed } = await adminClient.storage
                .from(bucket)
                .createSignedUrl(mediaRef.path, 15 * 60);

              mediaPayload = {
                ...mediaRef,
                signed_url: signed?.signedUrl ?? null,
                expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
              };
            } else {
              mediaPayload = mediaRef;
            }
          }

          items.push({
            queue_id: claimed.queue_id,
            attempt_id: claimed.attempt_id,
            session_key: claimed.session_key,
            recipient_phone: claimed.recipient_phone,
            recipient_jid: claimed.recipient_jid,
            message_type: claimed.message_type,
            body: claimed.body,
            location: claimed.location,
            media: mediaPayload,
          });
        }
      }

      return jsonOk({
        server_time_ms: Date.now(),
        flags,
        commands,
        items,
        acks,
      });
    }

    if (action === "janitor") {
      // 1. Clear expired QR payloads older than 120 seconds (Sec 11.4)
      const twoMinAgo = new Date(Date.now() - 120_000).toISOString();
      await adminClient
        .from("whatsapp_sessions")
        .update({ qr_payload: null, qr_expires_at: null })
        .not("qr_payload", "is", null)
        .lt("qr_updated_at", twoMinAgo);

      // 2. Delete finalized or >24h staging PDFs via Storage API (ADR-0008 — NEVER raw SQL DELETE)
      let stagingDeletedCount = 0;
      const { data: stagingQueueRows } = await adminClient
        .from("whatsapp_queue")
        .select("id, status, created_at, media_ref")
        .not("media_ref", "is", null)
        .in("status", ["sent", "failed", "cancelled", "skipped_opt_out", "skipped_invalid"])
        .limit(100);

      const pathsToRemove = new Set<string>();
      for (const row of stagingQueueRows ?? []) {
        const ref = row.media_ref as Record<string, unknown> | null;
        const path = typeof ref?.path === "string" ? ref.path : "";
        if (path.startsWith("whatsapp-staging/")) {
          pathsToRemove.add(path);
        }
      }

      if (pathsToRemove.size > 0) {
        const pathList = Array.from(pathsToRemove);
        const { error: rmErr } = await adminClient.storage
          .from("crm-attachments")
          .remove(pathList);
        if (!rmErr) {
          stagingDeletedCount = pathList.length;
        }
      }

      // 3. Redact message bodies older than 365 days & purge events/queue rows older than 90 days (Sec 11.4)
      const oneYearAgo = new Date(Date.now() - 365 * 86400_000).toISOString();
      const ninetyDaysAgo = new Date(Date.now() - 90 * 86400_000).toISOString();

      await adminClient
        .from("whatsapp_messages")
        .update({ body: null, media: null, location: null, redacted_at: new Date().toISOString() })
        .is("redacted_at", null)
        .lt("created_at", oneYearAgo);

      await adminClient
        .from("whatsapp_events")
        .delete()
        .lt("at", ninetyDaysAgo);

      await adminClient
        .from("whatsapp_queue")
        .delete()
        .in("status", ["sent", "failed", "cancelled", "skipped_opt_out", "skipped_invalid"])
        .lt("created_at", ninetyDaysAgo);

      return jsonOk({
        staging_deleted: stagingDeletedCount,
        at: new Date().toISOString(),
      });
    }

    return jsonErr("INVALID_ACTION", `Unsupported worker action: ${String(action)}`, 400);
  } catch (err) {
    return jsonErr("INTERNAL_ERROR", err instanceof Error ? err.message : "Unexpected error", 500);
  }
});