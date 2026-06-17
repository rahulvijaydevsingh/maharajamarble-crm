import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify the calling user
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { phone, name, lead_id, firm_name, professional_type } = await req.json();

    if (!phone) {
      return new Response(JSON.stringify({ error: "Phone number is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Normalize phone: strip spaces, dashes
    const normalizedPhone = phone.replace(/[\s\-()]/g, "");

    // Check if professional exists by phone
    const { data: existing, error: lookupError } = await supabase
      .from("professionals")
      .select("id, name, phone, firm_name, professional_type, email, verified, assigned_to")
      .or(`phone.eq.${normalizedPhone},alternate_phone.eq.${normalizedPhone}`)
      .limit(1)
      .maybeSingle();

    if (lookupError) {
      console.error("Lookup error:", lookupError);
      return new Response(JSON.stringify({ error: "Database lookup failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (existing) {
      return new Response(
        JSON.stringify({
          status: "existing",
          professional: existing,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // No match — insert new unverified professional
    // Get caller's profile for assigned_to
    const { data: profile } = await supabase
      .from("profiles")
      .select("email, full_name")
      .eq("id", user.id)
      .single();

    const staffEmail = profile?.email || user.email || "";
    const staffName = profile?.full_name || user.email || "Unknown";

    const newProfessional = {
      name: name || "Unknown Professional",
      phone: normalizedPhone,
      firm_name: firm_name || null,
      professional_type: professional_type || "contractor",
      assigned_to: staffEmail,
      created_by: staffEmail,
      verified: false,
      added_by: user.id,
      added_via_lead_id: lead_id || null,
      status: "active",
    };

    const { data: inserted, error: insertError } = await supabase
      .from("professionals")
      .insert(newProfessional)
      .select("id, name, phone, firm_name, professional_type, email, verified, assigned_to")
      .single();

    if (insertError) {
      console.error("Insert error:", insertError);
      return new Response(JSON.stringify({ error: "Failed to add professional" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create admin notification for verification
    // Get all admin emails
    const { data: adminRoles } = await supabase
      .from("user_roles")
      .select("user_id")
      .in("role", ["super_admin", "admin"]);

    if (adminRoles && adminRoles.length > 0) {
      const adminIds = adminRoles.map((r: any) => r.user_id);
      const { data: adminProfiles } = await supabase
        .from("profiles")
        .select("email")
        .in("id", adminIds);

      if (adminProfiles) {
        const notifications = adminProfiles.map((ap: any) => ({
          user_id: ap.email,
          title: "New Professional Needs Verification",
          message: `${staffName} added "${inserted.name}" (${normalizedPhone}) as a professional. Please verify.`,
          type: "professional_verification",
          is_read: false,
          is_dismissed: false,
        }));

        await supabase.from("notifications").insert(notifications);
      }
    }

    // Log to staff activity
    await supabase.from("staff_activity_log").insert({
      user_email: staffEmail,
      user_id: user.id,
      action_type: "create_professional",
      description: `Auto-added professional: ${inserted.name} (${normalizedPhone})`,
      entity_type: "professional",
      entity_id: inserted.id,
      metadata: { auto_added: true, lead_id: lead_id || null },
    });

    return new Response(
      JSON.stringify({
        status: "new_added",
        professional: inserted,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
