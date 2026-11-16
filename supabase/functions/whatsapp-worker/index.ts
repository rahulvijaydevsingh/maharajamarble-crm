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
    const appEnv = Deno.env.get("WA_ENV") === "production" ? "production" : "preview";

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
      const probeSalt = (Deno.env.get("WA_PROBE_SALT") ?? "").trim();
      if (!probeSalt) {
        return jsonErr("SERVER_MISCONFIGURED", "WA_PROBE_SALT is not configured on the server.", 500);
      }

      await adminClient.rpc("wa_expire_leases");

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
        probe_salt: probeSalt,
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
      // 1. Process reported queue results FIRST so late outcomes beat lease expiry
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

      // 2. Expire any remaining stale sending leases
      await adminClient.rpc("wa_expire_leases");

      // 3. Apply session status/QR updates from worker ONLY when fields actually change (I13)
      const reportedSessions: WorkerSessionReport[] = Array.isArray(body.sessions) ? body.sessions : [];
      const readySessionKeys = new Set<string>();

      for (const s of reportedSessions) {
        if (!s?.session_key) continue;
        if (s.ready && s.status === "connected") {
          readySessionKeys.add(s.session_key);
        }

        const { data: existing } = await adminClient
          .from("whatsapp_sessions")
          .select("*")
          .eq("session_key", s.session_key)
          .maybeSingle();

        if (!existing) continue;

        const updatePayload: Record<string, unknown> = {};
        let hasChanges = false;

        if (existing.worker_instance_id !== workerId) {
          updatePayload.worker_instance_id = workerId;
          hasChanges = true;
        }

        const preservePairingRequested =
          existing.status === "pairing_requested" &&
          s.status === "disconnected" &&
          existing.desired_state === "connected";

        let targetStatus = preservePairingRequested ? existing.status : s.status;
        if (s.qr && s.status !== "connected") {
          targetStatus = "awaiting_qr";
        }

        if (targetStatus !== existing.status) {
          updatePayload.status = targetStatus;
          hasChanges = true;
        }

        if (s.status === "connected") {
          if (existing.qr_payload !== null || existing.qr_expires_at !== null) {
            updatePayload.qr_payload = null;
            updatePayload.qr_expires_at = null;
            hasChanges = true;
          }
          if (existing.status !== "connected" || !existing.connected_at) {
            updatePayload.connected_at = new Date().toISOString();
            hasChanges = true;
          }
          if (!existing.warmup_started_at) {
            updatePayload.warmup_started_at = new Date().toISOString();
            hasChanges = true;
          }
        } else if (s.qr) {
          const qrSvg = s.qr.startsWith("data:image/")
            ? null
            : await QRCode.toString(s.qr, { type: "svg", width: 320, margin: 1 });
          const nextQrPayload = s.qr.startsWith("data:image/")
            ? s.qr
            : `data:image/svg+xml;base64,${btoa(qrSvg ?? "")}`;
          if (existing.qr_payload !== nextQrPayload) {
            updatePayload.qr_payload = nextQrPayload;
            updatePayload.qr_updated_at = new Date().toISOString();
            updatePayload.qr_expires_at = s.qr_expires_at ?? new Date(Date.now() + 60_000).toISOString();
            hasChanges = true;
          }
        } else if (
          (s.status === "disconnected" || s.status === "logged_out") &&
          (existing.qr_payload !== null || existing.qr_expires_at !== null)
        ) {
          updatePayload.qr_payload = null;
          updatePayload.qr_expires_at = null;
          hasChanges = true;
        }

        if (s.phone_number !== undefined && s.phone_number !== existing.phone_number) {
          updatePayload.phone_number = s.phone_number;
          hasChanges = true;
        }
        if (s.wa_jid !== undefined && s.wa_jid !== existing.wa_jid) {
          updatePayload.wa_jid = s.wa_jid;
          hasChanges = true;
        }
        if (s.push_name !== undefined && s.push_name !== existing.push_name) {
          updatePayload.push_name = s.push_name;
          hasChanges = true;
        }

        if (s.disconnect) {
          const nextCode = s.disconnect.code ?? null;
          const nextReason = s.disconnect.reason ?? null;
          if (
            nextCode !== existing.last_disconnect_code ||
            nextReason !== existing.last_disconnect_reason
          ) {
            updatePayload.last_disconnect_code = nextCode;
            updatePayload.last_disconnect_reason = nextReason;
            updatePayload.last_disconnect_at = s.disconnect.at ?? new Date().toISOString();
            hasChanges = true;
          }
        }

        if (hasChanges) {
          updatePayload.updated_at = new Date().toISOString();
          await adminClient
            .from("whatsapp_sessions")
            .update(updatePayload)
            .eq("id", existing.id);
        }
      }

      // 4. Update worker heartbeat stats
      const stats = body.stats ?? {};
      await adminClient
        .from("whatsapp_worker_instances")
        .upsert(
          {
            worker_id: workerId,
            app_env: appEnv,
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

      // 5. Compute session commands (and batch-check deactivated personal session owners — C1)
      const { data: allSessions } = await adminClient
        .from("whatsapp_sessions")
        .select("*");

      const personalOwnerIds = Array.from(
        new Set(
          (allSessions ?? [])
            .filter((s) => s.slot === "personal" && s.owner_user_id)
            .map((s) => String(s.owner_user_id)),
        ),
      );
      const inactiveOwnerIds = new Set<string>();
      if (personalOwnerIds.length > 0) {
        const { data: inactiveRows } = await adminClient
          .from("profiles")
          .select("id")
          .in("id", personalOwnerIds)
          .eq("is_active", false);
        for (const row of inactiveRows ?? []) {
          inactiveOwnerIds.add(String(row.id));
        }
      }

      const commands: Array<{ session_key: string; action: string }> = [];
      const workerStateByKey = new Map<string, WorkerSessionReport>(
        reportedSessions.map((rs) => [rs.session_key, rs]),
      );

      for (const dbSess of allSessions ?? []) {
        const sKey = String(dbSess.session_key);
        const wSess = workerStateByKey.get(sKey);

        if (
          dbSess.slot === "personal" &&
          inactiveOwnerIds.has(String(dbSess.owner_user_id)) &&
          dbSess.desired_state !== "logged_out"
        ) {
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

        if (dbSess.desired_state === "logged_out") {
          if (wSess && wSess.status !== "disconnected" && wSess.status !== "logged_out") {
            commands.push({ session_key: sKey, action: "logout" });
          } else if (dbSess.status === "logged_out") {
            await adminClient
              .from("whatsapp_sessions")
              .update({
                desired_state: "disconnected",
                status: "disconnected",
                updated_at: new Date().toISOString(),
              })
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

      // 2. Delete finalized or >24h staging PDFs via Storage API using wa_staging_cleanup_candidates (I4)
      let stagingDeletedCount = 0;
      const { data: staleRows, error: staleErr } = await adminClient.rpc(
        "wa_staging_cleanup_candidates",
        { p_limit: 200 },
      );

      if (staleErr) {
        await adminClient.from("whatsapp_events").insert({
          level: "warn",
          worker_id: workerId,
          code: "STAGING_QUERY_FAILED",
          detail: { message: staleErr.message },
        });
      } else {
        const pathList = (staleRows ?? []).map((row: { name: string }) => row.name);
        if (pathList.length > 0) {
          const { error: rmErr } = await adminClient.storage
            .from("crm-attachments")
            .remove(pathList);
          if (rmErr) {
            await adminClient.from("whatsapp_events").insert({
              level: "warn",
              worker_id: workerId,
              code: "STAGING_REMOVE_FAILED",
              detail: { message: rmErr.message },
            });
          } else {
            stagingDeletedCount = pathList.length;
          }
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
  } catch {
    return jsonErr("INTERNAL_ERROR", "Unexpected error processing worker request.", 500);
  }
});