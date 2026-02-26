import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse, readJson } from "../_shared/http.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify caller is authenticated
    const authHeader = req.headers.get("Authorization") || "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify JWT with anon client
    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: authError } = await anonClient.auth.getUser();
    if (authError || !user) {
      return jsonResponse({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await readJson<{
      user_id: string;
      user_email: string;
      user_agent: string;
    }>(req);

    // Use service role to bypass RLS
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { error: insertError } = await adminClient
      .from("staff_activity_log")
      .insert([{
        user_id: body.user_id || user.id,
        user_email: body.user_email || user.email,
        action_type: "login",
        action_description: `User logged in: ${body.user_email || user.email}`,
        entity_type: "auth",
        metadata: { user_agent: body.user_agent || "unknown" },
        user_agent: body.user_agent || "unknown",
      }]);

    if (insertError) {
      console.error("Insert error:", insertError);
      return jsonResponse({ error: insertError.message }, { status: 500 });
    }

    return jsonResponse({ success: true });
  } catch (e) {
    console.error("log-login error:", e);
    return jsonResponse({ error: e.message }, { status: 500 });
  }
});
