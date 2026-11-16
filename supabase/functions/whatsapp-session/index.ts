import {
  authenticateStaffRequest,
  broadcastDoorbellWake,
  corsHeaders,
  createServiceClient,
  jsonErr,
  jsonOk,
} from "../_shared/whatsappAuth.ts";

type SessionAction =
  | "connect"
  | "disconnect"
  | "logout"
  | "refresh_qr"
  | "pause"
  | "resume"
  | "status";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonErr("METHOD_NOT_ALLOWED", "POST required", 405);
  }

  try {
    const adminClient = createServiceClient();
    const authResult = await authenticateStaffRequest(req, adminClient);
    if (!authResult.ok) {
      return authResult.response;
    }
    const { caller } = authResult;

    const body = await req.json().catch(() => ({}));
    const action = (body.action ?? "status") as SessionAction;
    const slot = (body.slot ?? "main") as "main" | "bulk" | "personal";

    const validActions: SessionAction[] = [
      "connect",
      "disconnect",
      "logout",
      "refresh_qr",
      "pause",
      "resume",
      "status",
    ];
    if (!validActions.includes(action)) {
      return jsonErr("INVALID_ACTION", "Unsupported session action.", 400);
    }

    if (!["main", "bulk", "personal"].includes(slot)) {
      return jsonErr("INVALID_SLOT", "Unsupported WhatsApp slot.", 400);
    }

    if (slot === "main" || slot === "bulk") {
      if (action !== "status" && !caller.isAdmin) {
        return jsonErr("FORBIDDEN", "Only admins can manage company WhatsApp sessions.", 403);
      }
    } else {
      if (action === "pause" || action === "resume") {
        if (!caller.isAdmin) {
          return jsonErr("FORBIDDEN", "Only admins can pause or resume sessions.", 403);
        }
      } else if (!caller.isAdmin) {
        const { data: perm } = await adminClient
          .from("whatsapp_user_permissions")
          .select("can_connect_own_qr")
          .eq("user_id", caller.userId)
          .maybeSingle();

        if (!perm?.can_connect_own_qr) {
          return jsonErr("FORBIDDEN", "You do not have permission to connect a personal QR session.", 403);
        }
      }
    }

    const { data: settings } = await adminClient
      .from("whatsapp_settings")
      .select("*")
      .limit(1)
      .single();

    let sessionRow: Record<string, unknown> | null = null;

    if (slot === "main" || slot === "bulk") {
      const mappedId = slot === "main" ? settings?.main_session_id : settings?.bulk_session_id;
      if (mappedId) {
        const { data } = await adminClient
          .from("whatsapp_sessions")
          .select("*")
          .eq("id", mappedId)
          .maybeSingle();
        sessionRow = data;
      }
      if (!sessionRow) {
        const { data } = await adminClient
          .from("whatsapp_sessions")
          .select("*")
          .eq("slot", slot)
          .maybeSingle();
        sessionRow = data;
      }
      if (!sessionRow) {
        const { data: created, error: createErr } = await adminClient
          .from("whatsapp_sessions")
          .insert({
            slot,
            session_key: slot,
            label: slot === "main" ? "Official Main WhatsApp" : "Company Bulk WhatsApp",
            status: "disconnected",
            desired_state: "disconnected",
            created_by: caller.fullName,
            created_by_user_id: caller.userId,
          })
          .select("*")
          .single();

        if (createErr || !created) {
          return jsonErr("SLOT_NOT_MAPPED", "Could not initialize company session slot.", 400);
        }
        sessionRow = created;
      }
    } else {
      const targetOwnerId =
        caller.isAdmin && typeof body.owner_user_id === "string" && UUID_REGEX.test(body.owner_user_id)
          ? body.owner_user_id
          : caller.userId;

      let targetOwnerName = caller.fullName;
      if (targetOwnerId !== caller.userId) {
        const { data: ownerProf } = await adminClient
          .from("profiles")
          .select("full_name")
          .eq("id", targetOwnerId)
          .maybeSingle();
        const resolvedOwnerName = (ownerProf?.full_name ?? "").trim();
        if (!resolvedOwnerName || resolvedOwnerName.includes("@") || UUID_REGEX.test(resolvedOwnerName)) {
          return jsonErr("PROFILE_NAME_MISSING", "Target staff member must have a valid Full Name.", 400);
        }
        targetOwnerName = resolvedOwnerName;
      }

      const { data: existingPersonal } = await adminClient
        .from("whatsapp_sessions")
        .select("*")
        .eq("slot", "personal")
        .eq("owner_user_id", targetOwnerId)
        .maybeSingle();

      sessionRow = existingPersonal;

      if (!sessionRow && (action === "connect" || action === "refresh_qr")) {
        const sessionKey = `u-${targetOwnerId.replace(/[^a-f0-9]/gi, "").slice(0, 8)}`;
        const { data: created, error: createErr } = await adminClient
          .from("whatsapp_sessions")
          .insert({
            slot: "personal",
            session_key: sessionKey,
            owner_user_id: targetOwnerId,
            owner_name: targetOwnerName,
            label: `${targetOwnerName} (Personal)`,
            status: "pairing_requested",
            desired_state: "connected",
            created_by: caller.fullName,
            created_by_user_id: caller.userId,
          })
          .select("*")
          .single();

        if (createErr || !created) {
          return jsonErr("SESSION_CREATE_FAILED", "Could not create personal WhatsApp session.", 400);
        }
        sessionRow = created;
      }
    }

    if (!sessionRow) {
      return jsonOk({
        slot,
        status: "disconnected",
        desired_state: "disconnected",
        paused: false,
      });
    }

    if (action === "status") {
      const { qr_payload: _omitQr, ...safeSession } = sessionRow;
      return jsonOk({ session: safeSession });
    }

    const sessionId = String(sessionRow.id);
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (action === "connect" || action === "refresh_qr") {
      updates.desired_state = "connected";
      updates.status = "pairing_requested";
      updates.qr_payload = null;
      updates.qr_expires_at = null;
      updates.paused = false;
      updates.paused_reason = null;
    } else if (action === "disconnect") {
      updates.desired_state = "disconnected";
      updates.status = "disconnected";
      updates.qr_payload = null;
      updates.qr_expires_at = null;
    } else if (action === "logout") {
      updates.desired_state = "logged_out";
      updates.status = "logged_out";
      updates.qr_payload = null;
      updates.qr_expires_at = null;
    } else if (action === "pause") {
      updates.paused = true;
      updates.paused_reason = typeof body.reason === "string" && body.reason.trim()
        ? body.reason.trim()
        : `Paused by ${caller.fullName}`;
      updates.paused_at = new Date().toISOString();
    } else if (action === "resume") {
      updates.paused = false;
      updates.paused_reason = null;
      updates.paused_at = null;
      if (sessionRow.status === "paused_safety") {
        updates.status = sessionRow.desired_state === "connected" ? "connected" : "disconnected";
      }
    }

    const { data: updated, error: updateErr } = await adminClient
      .from("whatsapp_sessions")
      .update(updates)
      .eq("id", sessionId)
      .select("*")
      .single();

    if (updateErr || !updated) {
      return jsonErr("UPDATE_FAILED", "Could not update WhatsApp session state.", 500);
    }

    await broadcastDoorbellWake(adminClient, `session_${action}`);

    const { qr_payload: _omitQr, ...safeUpdated } = updated as Record<string, unknown>;
    return jsonOk({ session: safeUpdated });
  } catch {
    return jsonErr("INTERNAL_ERROR", "Unexpected error processing session request.", 500);
  }
});