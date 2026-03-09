import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Auth check
    const authHeader = req.headers.get("Authorization") || "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: userData, error: authErr } = await userClient.auth.getUser();
    if (authErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { userId, action, instanceName: disconnectInstance } = body;

    // Get settings
    const { data: settings } = await supabase
      .from("whatsapp_settings")
      .select("*")
      .limit(1)
      .single();

    if (!settings?.module_enabled) {
      return new Response(JSON.stringify({ error: "WhatsApp module is disabled" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const evolutionUrl = settings.evolution_api_url;
    const evolutionKey = Deno.env.get("EVOLUTION_API_KEY");

    if (!evolutionUrl || !evolutionKey) {
      return new Response(
        JSON.stringify({ error: "Evolution API not configured. Add URL in settings and API key as a secret." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Disconnect action
    if (action === "disconnect" && disconnectInstance) {
      try {
        await fetch(`${evolutionUrl}/instance/logout/${disconnectInstance}`, {
          method: "DELETE",
          headers: { apikey: evolutionKey },
        });
      } catch {
        // Ignore logout errors
      }
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create session
    const instanceName = `user_${userId}`;

    // Check if instance already exists - try to get its state
    let existingInstance = false;
    try {
      const stateRes = await fetch(`${evolutionUrl}/instance/connectionState/${instanceName}`, {
        headers: { apikey: evolutionKey },
      });
      if (stateRes.ok) {
        const stateData = await stateRes.json();
        if (stateData?.instance?.state === "open") {
          // Already connected
          return new Response(
            JSON.stringify({ success: true, alreadyConnected: true }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        existingInstance = true;
      }
    } catch {
      // Instance doesn't exist yet
    }

    // Create or reconnect instance
    if (!existingInstance) {
      const createRes = await fetch(`${evolutionUrl}/instance/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: evolutionKey,
        },
        body: JSON.stringify({
          instanceName,
          qrcode: true,
          integration: "WHATSAPP-BAILEYS",
        }),
      });

      if (!createRes.ok) {
        const errBody = await createRes.text();
        return new Response(
          JSON.stringify({ error: `Failed to create instance: ${errBody}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const createData = await createRes.json();

      // Upsert session record
      await supabase.from("whatsapp_sessions").upsert(
        {
          user_id: userId,
          instance_name: instanceName,
          status: "qr_pending",
          session_type: "personal",
        },
        { onConflict: "instance_name" }
      );

      const qrCode = createData?.qrcode?.base64 || createData?.qrcode || null;
      return new Response(
        JSON.stringify({ success: true, qrCode, instanceName }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Existing instance - get new QR
    const connectRes = await fetch(`${evolutionUrl}/instance/connect/${instanceName}`, {
      headers: { apikey: evolutionKey },
    });
    const connectData = await connectRes.json();

    await supabase
      .from("whatsapp_sessions")
      .upsert(
        { user_id: userId, instance_name: instanceName, status: "qr_pending", session_type: "personal" },
        { onConflict: "instance_name" }
      );

    const qrCode = connectData?.base64 || connectData?.qrcode?.base64 || null;
    return new Response(
      JSON.stringify({ success: true, qrCode, instanceName }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("whatsapp-create-session error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
