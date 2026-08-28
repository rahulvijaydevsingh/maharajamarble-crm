import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, jsonResponse, readJson } from "../_shared/http.ts";
import { createAdminClient, requireAdmin } from "../_shared/authz.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const adminAuth = await requireAdmin(req);
  if (!adminAuth.ok) {
    return jsonResponse({ error: adminAuth.error }, { status: adminAuth.status });
  }

  const admin = createAdminClient();
  const body = await readJson<{ backup_id?: string; pin?: boolean }>(req);
  const { backup_id: backupId, pin } = body;

  if (!backupId || typeof pin !== "boolean") {
    return jsonResponse({ error: "backup_id (string) and pin (boolean) are required" }, { status: 400 });
  }

  try {
    const { data: job, error: jobErr } = await admin
      .from("backup_jobs")
      .select("id")
      .eq("id", backupId)
      .maybeSingle();

    if (jobErr || !job) {
      return jsonResponse({ error: "Backup job not found" }, { status: 404 });
    }

    let pinnedBy: string | null = null;
    let pinnedAt: string | null = null;

    if (pin) {
      const { data: profile } = await admin
        .from("profiles")
        .select("full_name")
        .eq("id", adminAuth.userId)
        .maybeSingle();

      pinnedBy = profile?.full_name || adminAuth.userEmail || adminAuth.userId;
      pinnedAt = new Date().toISOString();
    }

    const nowIso = new Date().toISOString();
    await admin
      .from("backup_jobs")
      .update({
        is_pinned: pin,
        pinned_by: pinnedBy,
        pinned_at: pinnedAt,
        updated_at: nowIso,
      })
      .eq("id", backupId);

    return jsonResponse({
      status: "success",
      backup_id: backupId,
      is_pinned: pin,
      pinned_by: pinnedBy,
      pinned_at: pinnedAt,
    });
  } catch (err) {
    console.error("Error in crm-backup-pin:", err);
    return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
});
