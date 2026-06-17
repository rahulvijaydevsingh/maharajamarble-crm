import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

import { corsHeaders, jsonResponse } from "../_shared/http.ts";
import { createAdminClient, requireAdmin } from "../_shared/authz.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const adminCheck = await requireAdmin(req);
  if (!adminCheck.ok) return jsonResponse({ error: adminCheck.error }, { status: adminCheck.status });

  try {
    const admin = createAdminClient();
    const url = new URL(req.url);
    const limit = Math.min(Number(url.searchParams.get("limit") || 20), 100);

    const { data, error } = await admin
      .from("crm_backups")
      .select("id, created_at, created_by, status, include_modules, formats, result_summary, json_file_path, xlsx_file_path")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);

    const enriched = await Promise.all(
      (data || []).map(async (b: any) => {
        const jsonUrl = b.json_file_path
          ? (await admin.storage.from("crm-backups").createSignedUrl(b.json_file_path, 60 * 60)).data?.signedUrl
          : null;
        const xlsxUrl = b.xlsx_file_path
          ? (await admin.storage.from("crm-backups").createSignedUrl(b.xlsx_file_path, 60 * 60)).data?.signedUrl
          : null;

        return { ...b, json_url: jsonUrl || null, xlsx_url: xlsxUrl || null };
      })
    );

    return jsonResponse({ success: true, backups: enriched });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return jsonResponse({ error: message }, { status: 500 });
  }
});
