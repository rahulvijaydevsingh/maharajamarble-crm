import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function sanitize(input: string | undefined | null, maxLen = 500): string {
  if (!input) return "";
  return input
    .replace(/<[^>]*>/g, "")
    .replace(/[<>"'&]/g, "")
    .trim()
    .substring(0, maxLen);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ success: false, error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const body = await req.json();

    // Validate webhook secret
    const expectedSecret = Deno.env.get("WEBHOOK_LEAD_SECRET");
    if (!expectedSecret || body.webhook_secret !== expectedSecret) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid webhook secret" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate required fields
    const name = sanitize(body.name, 200);
    const phone = sanitize(body.phone, 20);
    if (!name || !phone) {
      return new Response(
        JSON.stringify({ success: false, error: "name and phone are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Round-robin assignment: get active staff
    const { data: profiles } = await supabase
      .from("profiles")
      .select("email, full_name")
      .eq("is_active", true);

    let assignedTo = "admin";
    if (profiles && profiles.length > 0) {
      // Get count of leads per staff for round-robin
      const { count } = await supabase
        .from("leads")
        .select("*", { count: "exact", head: true });
      const idx = (count || 0) % profiles.length;
      assignedTo = profiles[idx].full_name || profiles[idx].email || "admin";
    }

    // Insert lead
    const { data: lead, error: insertError } = await supabase
      .from("leads")
      .insert({
        name,
        phone,
        email: sanitize(body.email, 200) || null,
        source: "website",
        status: "new",
        priority: 3,
        designation: "customer",
        assigned_to: assignedTo,
        created_by: assignedTo,
        notes: sanitize(body.message, 1000) || null,
        site_location: sanitize(body.location, 500) || null,
        material_interests: body.service ? [sanitize(body.service, 100)] : null,
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("Lead insert error:", insertError);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to create lead" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Log activity
    await supabase.from("activity_log").insert({
      title: "Website Lead Captured",
      activity_type: "lead_created",
      activity_category: "system",
      description: `New lead from website: ${name} (${phone})`,
      lead_id: lead.id,
      user_name: "System",
      metadata: { source: "webhook", assigned_to: assignedTo },
    });

    return new Response(
      JSON.stringify({ success: true, lead_id: lead.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Webhook error:", err);
    return new Response(
      JSON.stringify({ success: false, error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
