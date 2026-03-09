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

    // Settings
    const { data: settings } = await supabase
      .from("whatsapp_settings")
      .select("*")
      .limit(1)
      .single();

    if (!settings?.module_enabled) {
      return new Response(JSON.stringify({ processed: 0, reason: "disabled" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const evolutionUrl = settings.evolution_api_url;
    const evolutionKey = Deno.env.get("EVOLUTION_API_KEY");
    if (!evolutionUrl || !evolutionKey) {
      return new Response(JSON.stringify({ processed: 0, reason: "not_configured" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get pending queue items
    const now = new Date().toISOString();
    const { data: queueItems } = await supabase
      .from("whatsapp_queue")
      .select("*")
      .eq("status", "pending")
      .lte("scheduled_for", now)
      .order("priority", { ascending: true })
      .order("scheduled_for", { ascending: true })
      .limit(10);

    if (!queueItems || queueItems.length === 0) {
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Determine which instance to use for bulk
    const bulkInstance = settings.bulk_instance_name;
    let processed = 0;

    for (const item of queueItems) {
      // Rate limit for bulk
      if (item.is_bulk) {
        const today = now.split("T")[0];
        const { count } = await supabase
          .from("whatsapp_messages")
          .select("*", { count: "exact", head: true })
          .gte("sent_at", `${today}T00:00:00Z`)
          .eq("status", "sent");

        // Rough check - in production you'd filter by bulk session
        if ((count || 0) >= settings.daily_limit_bulk) {
          await supabase
            .from("whatsapp_queue")
            .update({ status: "rate_limited", last_error: "Daily bulk limit reached" })
            .eq("id", item.id);
          continue;
        }
      }

      const instanceName = item.is_bulk && bulkInstance ? bulkInstance : null;
      if (!instanceName) {
        // For non-bulk without a specific session, skip
        // In a real system you'd look up the session
        await supabase
          .from("whatsapp_queue")
          .update({
            status: "failed",
            last_error: "No session available",
            attempts: (item.attempts || 0) + 1,
          })
          .eq("id", item.id);
        continue;
      }

      const phone = item.recipient_phone.replace(/[^\d]/g, "");

      try {
        const res = await fetch(`${evolutionUrl}/message/sendText/${instanceName}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: evolutionKey },
          body: JSON.stringify({ number: phone, text: item.message_body }),
        });

        const resData = await res.json();

        if (res.ok) {
          await supabase
            .from("whatsapp_queue")
            .update({ status: "sent", processed_at: new Date().toISOString() })
            .eq("id", item.id);

          // Log to messages table
          await supabase.from("whatsapp_messages").insert({
            recipient_phone: item.recipient_phone,
            recipient_name: item.recipient_name,
            lead_id: item.lead_id,
            customer_id: item.customer_id,
            message_type: item.message_type || "text",
            message_body: item.message_body,
            status: "sent",
            sent_at: new Date().toISOString(),
            evolution_message_id: resData?.key?.id || null,
          });

          processed++;
        } else {
          await supabase
            .from("whatsapp_queue")
            .update({
              status: (item.attempts || 0) >= 2 ? "failed" : "pending",
              last_error: JSON.stringify(resData),
              attempts: (item.attempts || 0) + 1,
            })
            .eq("id", item.id);
        }
      } catch (err) {
        await supabase
          .from("whatsapp_queue")
          .update({
            status: "failed",
            last_error: String(err),
            attempts: (item.attempts || 0) + 1,
          })
          .eq("id", item.id);
      }

      // Delay between sends
      const delay = settings.delay_between_msgs_seconds || 10;
      await new Promise((r) => setTimeout(r, delay * 1000));
    }

    return new Response(
      JSON.stringify({ processed, total: queueItems.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("whatsapp-process-queue error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
