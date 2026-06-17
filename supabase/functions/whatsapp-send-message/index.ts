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

    // Auth
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

    const userId = userData.user.id;

    // Settings
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
        JSON.stringify({ error: "Evolution API not configured" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get user's session
    const { data: session } = await supabase
      .from("whatsapp_sessions")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "connected")
      .limit(1)
      .single();

    if (!session) {
      return new Response(
        JSON.stringify({ error: "No connected WhatsApp session. Connect via Settings first." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const {
      recipientPhone,
      recipientName,
      messageBody,
      messageType = "text",
      mediaUrl,
      templateName,
      leadId,
      customerId,
    } = body;

    if (!recipientPhone || !messageBody) {
      return new Response(
        JSON.stringify({ error: "recipientPhone and messageBody are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Rate limit check
    const today = new Date().toISOString().split("T")[0];
    const { count } = await supabase
      .from("whatsapp_messages")
      .select("*", { count: "exact", head: true })
      .eq("session_id", session.id)
      .gte("sent_at", `${today}T00:00:00Z`)
      .eq("status", "sent");

    const limit = settings.daily_limit_main;
    if ((count || 0) >= limit) {
      return new Response(
        JSON.stringify({ error: `Daily limit of ${limit} messages reached` }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Normalize phone
    const phone = recipientPhone.replace(/[^\d]/g, "");

    // Send via Evolution API
    let evolutionResponse;
    if (messageType === "pdf" || messageType === "document" || messageType === "image") {
      evolutionResponse = await fetch(
        `${evolutionUrl}/message/sendMedia/${session.instance_name}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: evolutionKey },
          body: JSON.stringify({
            number: phone,
            mediatype: messageType === "image" ? "image" : "document",
            media: mediaUrl,
            caption: messageBody,
            fileName: mediaUrl?.split("/").pop() || "document.pdf",
          }),
        }
      );
    } else {
      evolutionResponse = await fetch(
        `${evolutionUrl}/message/sendText/${session.instance_name}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: evolutionKey },
          body: JSON.stringify({ number: phone, text: messageBody }),
        }
      );
    }

    const evolutionData = await evolutionResponse.json();

    const messageStatus = evolutionResponse.ok ? "sent" : "failed";
    const errorMsg = evolutionResponse.ok ? null : JSON.stringify(evolutionData);

    // Log message
    await supabase.from("whatsapp_messages").insert({
      session_id: session.id,
      sent_by: userId,
      lead_id: leadId || null,
      customer_id: customerId || null,
      recipient_phone: recipientPhone,
      recipient_name: recipientName || null,
      message_type: messageType,
      message_body: messageBody,
      media_url: mediaUrl || null,
      template_name: templateName || null,
      status: messageStatus,
      evolution_message_id: evolutionData?.key?.id || null,
      error_message: errorMsg,
      sent_at: messageStatus === "sent" ? new Date().toISOString() : null,
    });

    // Activity log
    if (messageStatus === "sent") {
      await supabase.from("activity_log").insert({
        title: `WhatsApp sent to ${recipientName || recipientPhone}`,
        activity_type: "whatsapp_sent",
        activity_category: "communication",
        description: messageBody.substring(0, 100),
        lead_id: leadId || null,
        customer_id: customerId || null,
        user_name: userData.user.email || "System",
        user_id: userId,
        metadata: { phone: recipientPhone, template: templateName, message_type: messageType },
      });
    }

    if (!evolutionResponse.ok) {
      return new Response(
        JSON.stringify({ error: `Message failed: ${errorMsg}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, messageId: evolutionData?.key?.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("whatsapp-send-message error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
