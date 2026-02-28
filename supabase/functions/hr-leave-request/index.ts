import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function isWeekday(dateStr: string, workDays: string[]): boolean {
  const dayMap: Record<number, string> = {
    0: "sun", 1: "mon", 2: "tue", 3: "wed", 4: "thu", 5: "fri", 6: "sat",
  };
  const d = new Date(dateStr + "T00:00:00");
  return workDays.includes(dayMap[d.getDay()]);
}

function countWorkingDays(start: string, end: string, workDays: string[]): number {
  let count = 0;
  const current = new Date(start + "T00:00:00");
  const endDate = new Date(end + "T00:00:00");
  while (current <= endDate) {
    const dayMap: Record<number, string> = {
      0: "sun", 1: "mon", 2: "tue", 3: "wed", 4: "thu", 5: "fri", 6: "sat",
    };
    if (workDays.includes(dayMap[current.getDay()])) count++;
    current.setDate(current.getDate() + 1);
  }
  return count;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify user
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const staffId = claimsData.claims.sub;

    // Admin client for privileged operations
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Parse body
    const body = await req.json();
    const { leave_type, start_date, end_date, reason, half_day_type, document_url } = body;

    // Validate inputs
    if (!leave_type || !start_date || !reason) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (reason.trim().length < 10) {
      return new Response(JSON.stringify({ error: "Reason must be at least 10 characters" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const effectiveEndDate = end_date || start_date;

    // Get staff work days
    const { data: hrSettings } = await adminClient
      .from("staff_hr_settings")
      .select("work_days")
      .eq("staff_id", staffId)
      .maybeSingle();

    const workDays = hrSettings?.work_days || ["mon", "tue", "wed", "thu", "fri", "sat"];

    // Calculate working days
    let totalDays: number;
    if (leave_type === "half_day") {
      totalDays = 0.5;
    } else {
      totalDays = countWorkingDays(start_date, effectiveEndDate, workDays);
    }

    if (totalDays <= 0) {
      return new Response(JSON.stringify({ error: "No working days in selected range" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check leave balance (skip for LWP and half_day)
    const balanceLeaveTypes = ["sick", "casual", "earned"];
    const mappedType = leave_type === "half_day" ? "casual" : leave_type;
    
    if (balanceLeaveTypes.includes(mappedType)) {
      const currentYear = new Date().getFullYear();
      const { data: balance } = await adminClient
        .from("leave_balances")
        .select("remaining")
        .eq("staff_id", staffId)
        .eq("leave_type", mappedType)
        .eq("year", currentYear)
        .maybeSingle();

      if (!balance) {
        return new Response(JSON.stringify({ error: `No ${mappedType} leave balance found for this year` }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (balance.remaining < totalDays) {
        return new Response(JSON.stringify({
          error: `Insufficient ${mappedType} leave balance. You have ${balance.remaining} days remaining but requested ${totalDays} days.`,
        }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Insert leave request
    const { data: request, error: insertError } = await adminClient
      .from("leave_requests")
      .insert({
        staff_id: staffId,
        leave_type,
        start_date,
        end_date: effectiveEndDate,
        total_days: totalDays,
        reason: reason.trim(),
        half_day_type: leave_type === "half_day" ? (half_day_type || "morning") : null,
        document_url: document_url || null,
        status: "pending",
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("Insert error:", insertError);
      return new Response(JSON.stringify({ error: "Failed to submit leave request" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check affected tasks
    const { count: affectedTasksCount } = await adminClient
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("assigned_to", staffId)
      .gte("due_date", start_date)
      .lte("due_date", effectiveEndDate)
      .neq("status", "Completed");

    // Get staff name for notification
    const { data: profile } = await adminClient
      .from("profiles")
      .select("full_name, email")
      .eq("id", staffId)
      .single();

    const staffName = profile?.full_name || profile?.email || "A staff member";

    // Notify all admin users
    const { data: adminRoles } = await adminClient
      .from("user_roles")
      .select("user_id")
      .in("role", ["super_admin", "admin"]);

    if (adminRoles && adminRoles.length > 0) {
      // Get admin emails for notification user_id field
      const adminIds = adminRoles.map((r: any) => r.user_id);
      const { data: adminProfiles } = await adminClient
        .from("profiles")
        .select("id, email")
        .in("id", adminIds);

      if (adminProfiles) {
        const notifications = adminProfiles.map((admin: any) => ({
          user_id: admin.email,
          title: "Leave Request Submitted",
          message: `${staffName} has requested ${leave_type} leave from ${start_date} to ${effectiveEndDate} (${totalDays} days)`,
          type: "hr_leave_request",
          entity_type: "leave_request",
          entity_id: request.id,
        }));

        await adminClient.from("notifications").insert(notifications);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        request_id: request.id,
        working_days: totalDays,
        affected_tasks_count: affectedTasksCount || 0,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("hr-leave-request error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
