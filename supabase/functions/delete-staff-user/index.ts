import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateUUID } from "../_shared/validation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Verify admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user: requestingUser }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !requestingUser) {
      return new Response(JSON.stringify({ error: "Invalid authorization" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    const { data: roleRow } = await supabase.from("user_roles").select("role").eq("user_id", requestingUser.id).single();
    if (roleRow?.role !== "super_admin" && roleRow?.role !== "admin") {
      return new Response(JSON.stringify({ error: "Only admins can delete staff" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 403,
      });
    }

    const body = await req.json();
    const userIdResult = validateUUID(body.user_id, "user_id");
    if (!userIdResult.success) {
      return new Response(JSON.stringify({ error: userIdResult.error }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }
    const targetUserId = userIdResult.data!;
    const transferToEmail = body.transfer_to_email as string;

    if (!transferToEmail) {
      return new Response(JSON.stringify({ error: "transfer_to_email is required" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    // Prevent self-deletion
    if (targetUserId === requestingUser.id) {
      return new Response(JSON.stringify({ error: "Cannot delete your own account" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    // Get target user's email for transfer
    const { data: targetProfile } = await supabase.from("profiles").select("email").eq("id", targetUserId).single();
    const targetEmail = targetProfile?.email;

    if (!targetEmail) {
      return new Response(JSON.stringify({ error: "Target user not found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 404,
      });
    }

    // Transfer all assigned entities
    const tables = ["leads", "tasks", "customers", "professionals", "reminders"];
    const transferLog: string[] = [];

    for (const table of tables) {
      const { data: rows, error: countErr } = await supabase
        .from(table)
        .select("id", { count: "exact" })
        .eq("assigned_to", targetEmail);

      // Update assigned_to
      const { error: updateErr, count } = await supabase
        .from(table)
        .update({ assigned_to: transferToEmail })
        .eq("assigned_to", targetEmail);

      if (updateErr) {
        transferLog.push(`Failed to transfer ${table}: ${updateErr.message}`);
      } else {
        transferLog.push(`Transferred ${table} records to ${transferToEmail}`);
      }
    }

    // Also transfer created_by references
    for (const table of tables) {
      await supabase
        .from(table)
        .update({ created_by: transferToEmail } as any)
        .eq("created_by", targetEmail);
    }

    // Delete user_roles entry
    await supabase.from("user_roles").delete().eq("user_id", targetUserId);

    // Deactivate profile (soft delete)
    await supabase.from("profiles").update({ is_active: false }).eq("id", targetUserId);

    // Log to staff_activity_log
    await supabase.from("staff_activity_log" as any).insert({
      user_id: requestingUser.id,
      user_email: requestingUser.email || "admin",
      action_type: "delete_staff",
      action_description: `Deleted staff ${targetEmail}, transferred responsibilities to ${transferToEmail}`,
      metadata: { target_user_id: targetUserId, target_email: targetEmail, transfer_to: transferToEmail, log: transferLog },
    });

    console.log(`Staff ${targetEmail} deleted by ${requestingUser.email}, transferred to ${transferToEmail}`);

    return new Response(
      JSON.stringify({ success: true, transfer_log: transferLog }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error: unknown) {
    console.error("Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
