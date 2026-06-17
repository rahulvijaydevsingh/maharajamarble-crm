import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
};

const RATE_LIMIT = 200;

function jsonRes(data: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...extra },
  });
}

async function hashKey(key: string): Promise<string> {
  const encoded = new TextEncoder().encode(key);
  const hash = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function checkRateLimit(
  supabase: any,
  keyId: string
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const now = new Date();
  const windowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours());
  const resetAt = Math.floor(new Date(windowStart.getTime() + 3600000).getTime() / 1000);

  const { data: existing } = await supabase
    .from("api_rate_limits")
    .select("id, request_count")
    .eq("key_id", keyId)
    .eq("window_start", windowStart.toISOString())
    .single();

  if (existing) {
    if (existing.request_count >= RATE_LIMIT) {
      return { allowed: false, remaining: 0, resetAt };
    }
    await supabase
      .from("api_rate_limits")
      .update({ request_count: existing.request_count + 1 })
      .eq("id", existing.id);
    return { allowed: true, remaining: RATE_LIMIT - existing.request_count - 1, resetAt };
  }

  await supabase.from("api_rate_limits").insert({
    key_id: keyId,
    window_start: windowStart.toISOString(),
    request_count: 1,
  });
  return { allowed: true, remaining: RATE_LIMIT - 1, resetAt };
}

function rateLimitHeaders(remaining: number, resetAt: number): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(RATE_LIMIT),
    "X-RateLimit-Remaining": String(remaining),
    "X-RateLimit-Reset": String(resetAt),
  };
}

function parsePagination(url: URL) {
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
  const perPage = Math.min(100, Math.max(1, parseInt(url.searchParams.get("per_page") || "50")));
  return { page, perPage, from: (page - 1) * perPage, to: page * perPage - 1 };
}

// ── HANDLERS ──

async function handleLeads(supabase: any, method: string, pathParts: string[], url: URL, body: any) {
  const id = pathParts[3]; // /v1/leads/:id

  if (method === "GET" && !id) {
    const { page, perPage, from, to } = parsePagination(url);
    let query = supabase.from("leads").select("*", { count: "exact" });
    const status = url.searchParams.get("status");
    const assignedTo = url.searchParams.get("assigned_to");
    const search = url.searchParams.get("search");
    const priority = url.searchParams.get("priority");
    const createdAfter = url.searchParams.get("created_after");
    const createdBefore = url.searchParams.get("created_before");
    if (status) query = query.eq("status", status);
    if (assignedTo) query = query.ilike("assigned_to", `%${assignedTo}%`);
    if (search) query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%,firm_name.ilike.%${search}%`);
    if (priority) query = query.eq("priority", parseInt(priority));
    if (createdAfter) query = query.gte("created_at", createdAfter);
    if (createdBefore) query = query.lte("created_at", createdBefore);
    query = query.order("created_at", { ascending: false }).range(from, to);
    const { data, error, count } = await query;
    if (error) return { success: false, error: error.message, code: "DB_ERROR" };
    return { success: true, data, meta: { total: count, page, per_page: perPage } };
  }

  if (method === "GET" && id) {
    const { data, error } = await supabase.from("leads").select("*").eq("id", id).single();
    if (error) return { success: false, error: "Lead not found", code: "NOT_FOUND" };
    return { success: true, data };
  }

  if (method === "POST") {
    if (!body?.name || !body?.phone) return { success: false, error: "name and phone required", code: "VALIDATION" };
    const { data, error } = await supabase.from("leads").insert({
      name: body.name, phone: body.phone, email: body.email || null,
      firm_name: body.firm_name || null, site_location: body.site_location || null,
      status: body.status || "new", priority: body.priority || 3,
      source: body.source || "api", assigned_to: body.assigned_to || "admin",
      created_by: body.assigned_to || "admin", designation: body.designation || "customer",
      material_interests: body.material_interests || null, notes: body.notes || null,
    }).select().single();
    if (error) return { success: false, error: error.message, code: "DB_ERROR" };
    return { success: true, data };
  }

  if (method === "PUT" && id) {
    const { data, error } = await supabase.from("leads").update(body).eq("id", id).select().single();
    if (error) return { success: false, error: error.message, code: "DB_ERROR" };
    return { success: true, data };
  }

  if (method === "DELETE" && id) {
    const { error } = await supabase.from("leads").delete().eq("id", id);
    if (error) return { success: false, error: error.message, code: "DB_ERROR" };
    return { success: true, message: "Lead deleted" };
  }

  // PATCH /v1/leads/:id/status
  if (method === "PATCH" && id && pathParts[4] === "status") {
    if (!body?.status) return { success: false, error: "status required", code: "VALIDATION" };
    const { data, error } = await supabase.from("leads").update({ status: body.status }).eq("id", id).select().single();
    if (error) return { success: false, error: error.message, code: "DB_ERROR" };
    return { success: true, data };
  }

  return { success: false, error: "Not found", code: "NOT_FOUND" };
}

async function handleTasks(supabase: any, method: string, pathParts: string[], url: URL, body: any) {
  const id = pathParts[3];

  if (method === "GET" && !id) {
    const { page, perPage, from, to } = parsePagination(url);
    let query = supabase.from("tasks").select("*", { count: "exact" });
    const status = url.searchParams.get("status");
    const assignedTo = url.searchParams.get("assigned_to");
    const dueBefore = url.searchParams.get("due_before");
    const dueAfter = url.searchParams.get("due_after");
    const leadId = url.searchParams.get("lead_id");
    if (status) query = query.eq("status", status);
    if (assignedTo) query = query.ilike("assigned_to", `%${assignedTo}%`);
    if (dueBefore) query = query.lte("due_date", dueBefore);
    if (dueAfter) query = query.gte("due_date", dueAfter);
    if (leadId) query = query.eq("related_entity_id", leadId);
    query = query.order("created_at", { ascending: false }).range(from, to);
    const { data, error, count } = await query;
    if (error) return { success: false, error: error.message, code: "DB_ERROR" };
    return { success: true, data, meta: { total: count, page, per_page: perPage } };
  }

  if (method === "POST") {
    if (!body?.title) return { success: false, error: "title required", code: "VALIDATION" };
    const { data, error } = await supabase.from("tasks").insert({
      title: body.title, description: body.description || null,
      due_date: body.due_date || null, assigned_to: body.assigned_to || "admin",
      created_by: body.assigned_to || "admin", priority: body.priority || "medium",
      status: body.status || "pending",
      related_entity_id: body.lead_id || body.related_entity_id || null,
      related_entity_type: body.lead_id ? "lead" : (body.related_entity_type || null),
    }).select().single();
    if (error) return { success: false, error: error.message, code: "DB_ERROR" };
    return { success: true, data };
  }

  if (method === "PUT" && id) {
    const { data, error } = await supabase.from("tasks").update(body).eq("id", id).select().single();
    if (error) return { success: false, error: error.message, code: "DB_ERROR" };
    return { success: true, data };
  }

  if (method === "DELETE" && id) {
    const { error } = await supabase.from("tasks").delete().eq("id", id);
    if (error) return { success: false, error: error.message, code: "DB_ERROR" };
    return { success: true, message: "Task deleted" };
  }

  if (method === "PATCH" && id && pathParts[4] === "complete") {
    const { data, error } = await supabase.from("tasks")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", id).select().single();
    if (error) return { success: false, error: error.message, code: "DB_ERROR" };
    return { success: true, data };
  }

  return { success: false, error: "Not found", code: "NOT_FOUND" };
}

async function handleReminders(supabase: any, method: string, pathParts: string[], url: URL, body: any) {
  const id = pathParts[3];

  if (method === "GET" && !id) {
    const { page, perPage, from, to } = parsePagination(url);
    let query = supabase.from("reminders").select("*", { count: "exact" });
    const assignedTo = url.searchParams.get("assigned_to");
    const fromDate = url.searchParams.get("from_date");
    const toDate = url.searchParams.get("to_date");
    const entityId = url.searchParams.get("lead_id") || url.searchParams.get("entity_id");
    if (assignedTo) query = query.ilike("assigned_to", `%${assignedTo}%`);
    if (fromDate) query = query.gte("reminder_datetime", fromDate);
    if (toDate) query = query.lte("reminder_datetime", toDate);
    if (entityId) query = query.eq("entity_id", entityId);
    query = query.order("reminder_datetime", { ascending: true }).range(from, to);
    const { data, error, count } = await query;
    if (error) return { success: false, error: error.message, code: "DB_ERROR" };
    return { success: true, data, meta: { total: count, page, per_page: perPage } };
  }

  if (method === "POST") {
    if (!body?.title || !body?.reminder_datetime) return { success: false, error: "title and reminder_datetime required", code: "VALIDATION" };
    const { data, error } = await supabase.from("reminders").insert({
      title: body.title, description: body.description || null,
      reminder_datetime: body.reminder_datetime,
      entity_id: body.lead_id || body.entity_id,
      entity_type: body.entity_type || "lead",
      assigned_to: body.assigned_to || "admin",
      created_by: body.assigned_to || "admin",
      is_recurring: body.is_recurring || false,
      recurrence_pattern: body.recurrence_pattern || null,
    }).select().single();
    if (error) return { success: false, error: error.message, code: "DB_ERROR" };
    return { success: true, data };
  }

  if (method === "PUT" && id) {
    const { data, error } = await supabase.from("reminders").update(body).eq("id", id).select().single();
    if (error) return { success: false, error: error.message, code: "DB_ERROR" };
    return { success: true, data };
  }

  if (method === "DELETE" && id) {
    const { error } = await supabase.from("reminders").delete().eq("id", id);
    if (error) return { success: false, error: error.message, code: "DB_ERROR" };
    return { success: true, message: "Reminder deleted" };
  }

  return { success: false, error: "Not found", code: "NOT_FOUND" };
}

async function handleQuotations(supabase: any, method: string, pathParts: string[], url: URL, body: any) {
  const id = pathParts[3];

  if (method === "GET" && !id) {
    const { page, perPage, from, to } = parsePagination(url);
    let query = supabase.from("quotations").select("*, quotation_items(*)", { count: "exact" });
    const status = url.searchParams.get("status");
    const createdAfter = url.searchParams.get("created_after");
    const clientId = url.searchParams.get("lead_id") || url.searchParams.get("client_id");
    if (status) query = query.eq("status", status);
    if (createdAfter) query = query.gte("created_at", createdAfter);
    if (clientId) query = query.eq("client_id", clientId);
    query = query.order("created_at", { ascending: false }).range(from, to);
    const { data, error, count } = await query;
    if (error) return { success: false, error: error.message, code: "DB_ERROR" };
    return { success: true, data, meta: { total: count, page, per_page: perPage } };
  }

  if (method === "GET" && id) {
    const { data, error } = await supabase.from("quotations").select("*, quotation_items(*)").eq("id", id).single();
    if (error) return { success: false, error: "Quotation not found", code: "NOT_FOUND" };
    return { success: true, data };
  }

  if (method === "POST") {
    if (!body?.client_name) return { success: false, error: "client_name required", code: "VALIDATION" };
    const qNum = `QT-${Date.now().toString(36).toUpperCase()}`;
    const { data, error } = await supabase.from("quotations").insert({
      client_name: body.client_name, client_id: body.client_id || null,
      client_type: body.client_type || "lead", client_phone: body.client_phone || null,
      client_email: body.client_email || null, client_address: body.client_address || null,
      quotation_number: qNum, status: body.status || "draft",
      assigned_to: body.assigned_to || "admin", created_by: body.assigned_to || "admin",
      notes: body.notes || null, subtotal: body.subtotal || 0,
      gst_percentage: body.gst_percentage || 18, gst_amount: body.gst_amount || 0,
      total: body.total || 0,
    }).select().single();
    if (error) return { success: false, error: error.message, code: "DB_ERROR" };

    // Insert line items if provided
    if (body.items && Array.isArray(body.items) && data) {
      const items = body.items.map((item: any, idx: number) => ({
        quotation_id: data.id, item_name: item.item_name || item.name,
        quantity: item.quantity || 1, rate: item.rate || 0,
        unit: item.unit || "pcs", amount: item.amount || (item.quantity || 1) * (item.rate || 0),
        sort_order: idx, description: item.description || null,
      }));
      await supabase.from("quotation_items").insert(items);
    }

    return { success: true, data };
  }

  if (method === "PUT" && id) {
    const { data, error } = await supabase.from("quotations").update(body).eq("id", id).select().single();
    if (error) return { success: false, error: error.message, code: "DB_ERROR" };
    return { success: true, data };
  }

  if (method === "DELETE" && id) {
    await supabase.from("quotation_items").delete().eq("quotation_id", id);
    const { error } = await supabase.from("quotations").delete().eq("id", id);
    if (error) return { success: false, error: error.message, code: "DB_ERROR" };
    return { success: true, message: "Quotation deleted" };
  }

  return { success: false, error: "Not found", code: "NOT_FOUND" };
}

async function handleActivity(supabase: any, method: string, url: URL, body: any) {
  if (method === "GET") {
    const { page, perPage, from, to } = parsePagination(url);
    let query = supabase.from("activity_log").select("*", { count: "exact" });
    const leadId = url.searchParams.get("lead_id");
    const actType = url.searchParams.get("activity_type");
    const fromDate = url.searchParams.get("from_date");
    const toDate = url.searchParams.get("to_date");
    if (leadId) query = query.eq("lead_id", leadId);
    if (actType) query = query.eq("activity_type", actType);
    if (fromDate) query = query.gte("activity_timestamp", fromDate);
    if (toDate) query = query.lte("activity_timestamp", toDate);
    query = query.order("activity_timestamp", { ascending: false }).range(from, to);
    const { data, error, count } = await query;
    if (error) return { success: false, error: error.message, code: "DB_ERROR" };
    return { success: true, data, meta: { total: count, page, per_page: perPage } };
  }

  if (method === "POST") {
    if (!body?.title || !body?.activity_type) return { success: false, error: "title and activity_type required", code: "VALIDATION" };
    const { data, error } = await supabase.from("activity_log").insert({
      title: body.title, activity_type: body.activity_type,
      activity_category: body.activity_category || "general",
      description: body.description || null, lead_id: body.lead_id || null,
      customer_id: body.customer_id || null, user_name: body.user_name || "API",
      metadata: body.metadata || null,
    }).select().single();
    if (error) return { success: false, error: error.message, code: "DB_ERROR" };
    return { success: true, data };
  }

  return { success: false, error: "Not found", code: "NOT_FOUND" };
}

async function handleStaff(supabase: any) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, full_name, phone, is_active")
    .eq("is_active", true);
  if (error) return { success: false, error: error.message, code: "DB_ERROR" };
  return { success: true, data };
}

async function handleSearch(supabase: any, url: URL) {
  const q = url.searchParams.get("q");
  if (!q) return { success: false, error: "q parameter required", code: "VALIDATION" };
  const { data, error } = await supabase
    .from("leads")
    .select("id, name, phone, email, firm_name, status, assigned_to")
    .or(`name.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%,firm_name.ilike.%${q}%`)
    .limit(20);
  if (error) return { success: false, error: error.message, code: "DB_ERROR" };
  return { success: true, data };
}

async function handleStats(supabase: any) {
  const [leadsRes, tasksRes, remindersRes] = await Promise.all([
    supabase.from("leads").select("status", { count: "exact" }),
    supabase.from("tasks").select("status").eq("status", "pending"),
    supabase.from("reminders").select("id").eq("is_dismissed", false).gte("reminder_datetime", new Date().toISOString().split("T")[0]),
  ]);

  const statusCounts: Record<string, number> = {};
  if (leadsRes.data) {
    for (const lead of leadsRes.data) {
      statusCounts[lead.status] = (statusCounts[lead.status] || 0) + 1;
    }
  }

  return {
    success: true,
    data: {
      total_leads: leadsRes.count || 0,
      leads_by_status: statusCounts,
      pending_tasks: tasksRes.data?.length || 0,
      reminders_today: remindersRes.data?.length || 0,
    },
  };
}

// ── MAIN ──

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const pathParts = url.pathname.split("/").filter(Boolean);
  // Path: /api/v1/resource or /v1/resource (depending on how Supabase routes)
  // Normalize: find "v1" in the path
  const v1Idx = pathParts.indexOf("v1");
  if (v1Idx === -1) {
    return jsonRes({ success: false, error: "Invalid API path. Use /v1/...", code: "NOT_FOUND" }, 404);
  }
  const resource = pathParts[v1Idx + 1];
  // Re-index pathParts relative to v1
  const normalizedParts = pathParts.slice(v1Idx);

  // Authenticate via API key
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return jsonRes({ success: false, error: "Missing API key", code: "UNAUTHORIZED" }, 401);
  }

  const apiKey = authHeader.replace("Bearer ", "");
  const keyHash = await hashKey(apiKey);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: keyRecord } = await supabase
    .from("api_keys")
    .select("id, user_id, is_active")
    .eq("key_hash", keyHash)
    .single();

  if (!keyRecord || !keyRecord.is_active) {
    return jsonRes({ success: false, error: "Invalid or revoked API key", code: "FORBIDDEN" }, 403);
  }

  // Update last_used_at
  await supabase.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", keyRecord.id);

  // Rate limiting
  const rateResult = await checkRateLimit(supabase, keyRecord.id);
  const rlHeaders = rateLimitHeaders(rateResult.remaining, rateResult.resetAt);
  if (!rateResult.allowed) {
    return jsonRes(
      { success: false, error: "Rate limit exceeded", retry_after: rateResult.resetAt - Math.floor(Date.now() / 1000) },
      429,
      rlHeaders
    );
  }

  // Parse body for non-GET
  let body: any = null;
  if (["POST", "PUT", "PATCH"].includes(req.method)) {
    try {
      body = await req.json();
    } catch {
      return jsonRes({ success: false, error: "Invalid JSON body", code: "BAD_REQUEST" }, 400, rlHeaders);
    }
  }

  let result: any;
  try {
    switch (resource) {
      case "leads":
        result = await handleLeads(supabase, req.method, normalizedParts, url, body);
        break;
      case "tasks":
        result = await handleTasks(supabase, req.method, normalizedParts, url, body);
        break;
      case "reminders":
        result = await handleReminders(supabase, req.method, normalizedParts, url, body);
        break;
      case "quotations":
        result = await handleQuotations(supabase, req.method, normalizedParts, url, body);
        break;
      case "activity":
        result = await handleActivity(supabase, req.method, url, body);
        break;
      case "staff":
        result = await handleStaff(supabase);
        break;
      case "search":
        result = await handleSearch(supabase, url);
        break;
      case "stats":
        result = await handleStats(supabase);
        break;
      default:
        result = { success: false, error: `Unknown resource: ${resource}`, code: "NOT_FOUND" };
    }
  } catch (err) {
    console.error("API error:", err);
    result = { success: false, error: "Internal server error", code: "INTERNAL_ERROR" };
  }

  const status = result.success ? 200 : (result.code === "NOT_FOUND" ? 404 : result.code === "VALIDATION" ? 400 : 500);
  return jsonRes(result, status, rlHeaders);
});
