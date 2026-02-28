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

    const userId = body.user_id || user.id;
    const userEmail = body.user_email || user.email;

    // Use service role to bypass RLS
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Check if this is first login today
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const { data: existingLogins, error: queryError } = await adminClient
      .from("staff_activity_log")
      .select("id")
      .eq("user_id", userId)
      .eq("action_type", "login")
      .gte("created_at", todayStart.toISOString())
      .limit(1);

    const firstLoginToday = !queryError && (!existingLogins || existingLogins.length === 0);

    // Insert login record
    const { error: insertError } = await adminClient
      .from("staff_activity_log")
      .insert([{
        user_id: userId,
        user_email: userEmail,
        action_type: "login",
        action_description: `User logged in: ${userEmail}`,
        entity_type: "auth",
        metadata: { user_agent: body.user_agent || "unknown" },
        user_agent: body.user_agent || "unknown",
      }]);

    if (insertError) {
      console.error("Insert error:", insertError);
      return jsonResponse({ error: insertError.message }, { status: 500 });
    }

    // Check if user should be prompted to clock in
    let shouldPromptClockIn = false;
    if (firstLoginToday) {
      // Check attendance for today
      const todayDate = todayStart.toISOString().split("T")[0];
      const { data: attendance } = await adminClient
        .from("attendance_records")
        .select("id, status")
        .eq("staff_id", userId)
        .eq("date", todayDate)
        .limit(1);

      // Also check if on approved leave today
      const { data: leaveToday } = await adminClient
        .from("leave_requests")
        .select("id")
        .eq("staff_id", userId)
        .eq("status", "approved")
        .lte("start_date", todayDate)
        .gte("end_date", todayDate)
        .limit(1);

      const hasAttendance = attendance && attendance.length > 0;
      const hasApprovedLeave = leaveToday && leaveToday.length > 0;

      shouldPromptClockIn = !hasAttendance && !hasApprovedLeave;
    }

    return jsonResponse({
      success: true,
      first_login_today: firstLoginToday,
      should_prompt_clock_in: shouldPromptClockIn,
    });
  } catch (e) {
    console.error("log-login error:", e);
    return jsonResponse({ error: e.message }, { status: 500 });
  }
});
