import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-worker-secret, x-worker-id, x-worker-timestamp, x-watchdog-secret",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

export function jsonOk(data: unknown, status = 200): Response {
  return new Response(JSON.stringify({ ok: true, data }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function jsonErr(code: string, message: string, status = 400): Response {
  return new Response(
    JSON.stringify({ ok: false, error: { code, message } }),
    {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
}

/**
 * Constant-time string comparison to prevent timing side-channel attacks on secrets.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const aBytes = enc.encode(a);
  const bBytes = enc.encode(b);
  const maxLen = Math.max(aBytes.length, bBytes.length);
  let diff = aBytes.length ^ bBytes.length;

  for (let i = 0; i < maxLen; i++) {
    const byteA = i < aBytes.length ? aBytes[i] : 0;
    const byteB = i < bBytes.length ? bBytes[i] : 0;
    diff |= byteA ^ byteB;
  }

  return diff === 0 && aBytes.length > 0;
}

export function createServiceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface AuthenticatedCaller {
  userId: string;
  fullName: string;
  isAdmin: boolean;
}

/**
 * Verifies the user JWT and resolves the staff member's full_name from profiles (INVARIANT-04).
 * Refuses if profiles.full_name is missing or shaped like an email/UUID.
 */
export async function authenticateStaffRequest(
  req: Request,
  adminClient: SupabaseClient,
): Promise<{ ok: true; caller: AuthenticatedCaller } | { ok: false; response: Response }> {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return { ok: false, response: jsonErr("UNAUTHORIZED", "Missing Bearer token", 401) };
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: authData, error: authErr } = await userClient.auth.getUser();
  if (authErr || !authData?.user) {
    return { ok: false, response: jsonErr("UNAUTHORIZED", "Invalid or expired user token", 401) };
  }

  const userId = authData.user.id;

  const { data: profiles } = await adminClient
    .from("profiles")
    .select("id, user_id, full_name, is_active")
    .eq("id", userId)
    .limit(1);

  const profile = profiles?.[0];
  if (profile && profile.is_active === false) {
    return { ok: false, response: jsonErr("FORBIDDEN", "Staff profile is deactivated", 403) };
  }

  const fullName = (profile?.full_name ?? "").trim();
  const isUuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(fullName);
  if (!fullName || fullName.includes("@") || isUuidLike) {
    return {
      ok: false,
      response: jsonErr(
        "PROFILE_NAME_MISSING",
        "Your staff profile must have a valid Full Name before using WhatsApp.",
        400,
      ),
    };
  }

  const { data: roles } = await adminClient
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);

  const isAdmin = (roles ?? []).some(
    (r: { role?: string }) => r.role === "admin" || r.role === "super_admin",
  );

  return {
    ok: true,
    caller: { userId, fullName, isAdmin },
  };
}

/**
 * Verifies worker requests using constant-time X-Worker-Secret (or WA_WORKER_SECRET_NEXT)
 * and a 5-minute X-Worker-Timestamp window (Sec 8.1).
 */
export async function authenticateWorkerRequest(
  req: Request,
  adminClient: SupabaseClient,
  nowMs = Date.now(),
): Promise<{ ok: true; workerId: string } | { ok: false; response: Response }> {
  const providedSecret = req.headers.get("x-worker-secret") ?? "";
  const workerId = (req.headers.get("x-worker-id") ?? "").trim();
  const rawTs = req.headers.get("x-worker-timestamp") ?? "";

  const currentSecret = Deno.env.get("WA_WORKER_SECRET") ?? "";
  const nextSecret = Deno.env.get("WA_WORKER_SECRET_NEXT") ?? "";

  const secretValid =
    (currentSecret.length > 0 && constantTimeEqual(providedSecret, currentSecret)) ||
    (nextSecret.length > 0 && constantTimeEqual(providedSecret, nextSecret));

  const parsedTs = Number(rawTs);
  const tsValid = Number.isFinite(parsedTs) && Math.abs(nowMs - parsedTs) <= 5 * 60 * 1000;

  if (!secretValid || !workerId || !tsValid) {
    // Rate-limit AUTH_REJECTED events to at most 1 per minute
    try {
      const oneMinAgo = new Date(nowMs - 60_000).toISOString();
      const { count } = await adminClient
        .from("whatsapp_events")
        .select("id", { count: "exact", head: true })
        .eq("code", "AUTH_REJECTED")
        .gte("at", oneMinAgo);

      if ((count ?? 0) === 0) {
        await adminClient.from("whatsapp_events").insert({
          level: "warn",
          worker_id: workerId || null,
          code: "AUTH_REJECTED",
          detail: {
            reason: !secretValid ? "BAD_SECRET" : !workerId ? "MISSING_WORKER_ID" : "TIMESTAMP_SKEW",
          },
        });
      }
    } catch {
      // Never fail response on event log error
    }

    return { ok: false, response: jsonErr("UNAUTHORIZED", "Unauthorized", 401) };
  }

  return { ok: true, workerId };
}

/**
 * Sends a lightweight untrusted wake broadcast on the Realtime doorbell channel (ADR-0005).
 */
export async function broadcastDoorbellWake(
  adminClient: SupabaseClient,
  reason: string,
): Promise<void> {
  try {
    const envName = Deno.env.get("WA_ENV") === "production" ? "production" : "preview";
    const channelName = `wa-gateway-${envName}`;
    const channel = adminClient.channel(channelName);
    await channel.send({
      type: "broadcast",
      event: "wake",
      payload: { reason, at: Date.now() },
    });
    await adminClient.removeChannel(channel);
  } catch {
    // Doorbell is best-effort; worker adaptive polling is the fallback
  }
}