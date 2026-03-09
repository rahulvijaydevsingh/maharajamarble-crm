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

    const { data: settings } = await supabase
      .from("whatsapp_settings")
      .select("evolution_api_url, module_enabled")
      .limit(1)
      .single();

    if (!settings?.module_enabled || !settings?.evolution_api_url) {
      return new Response(
        JSON.stringify({ status: "disconnected", error: "Module disabled" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const evolutionKey = Deno.env.get("EVOLUTION_API_KEY");
    if (!evolutionKey) {
      return new Response(
        JSON.stringify({ status: "disconnected", error: "API key not set" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { instanceName } = body;

    const res = await fetch(
      `${settings.evolution_api_url}/instance/connectionState/${instanceName}`,
      { headers: { apikey: evolutionKey } }
    );

    if (!res.ok) {
      return new Response(
        JSON.stringify({ status: "disconnected" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await res.json();
    const state = data?.instance?.state || "disconnected";
    const status = state === "open" ? "connected" : state === "connecting" ? "qr_pending" : "disconnected";

    // Try to get phone number if connected
    let phoneNumber: string | null = null;
    if (status === "connected") {
      try {
        const infoRes = await fetch(
          `${settings.evolution_api_url}/instance/fetchInstances?instanceName=${instanceName}`,
          { headers: { apikey: evolutionKey } }
        );
        if (infoRes.ok) {
          const infoData = await infoRes.json();
          const inst = Array.isArray(infoData) ? infoData[0] : infoData;
          phoneNumber = inst?.instance?.owner || inst?.owner || null;
        }
      } catch {
        // Ignore
      }
    }

    return new Response(
      JSON.stringify({ status, phoneNumber }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("whatsapp-session-status error:", err);
    return new Response(
      JSON.stringify({ status: "disconnected", error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
