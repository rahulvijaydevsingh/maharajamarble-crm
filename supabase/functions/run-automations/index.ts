import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Entity type mapping from automation rule config to DB table names
const ENTITY_TABLE_MAP: Record<string, string> = {
  leads: "leads",
  tasks: "tasks",
  customers: "customers",
  professionals: "professionals",
  quotations: "quotations",
  staff_activity: "staff_activity_log",
  kit: "kit_subscriptions",
};

interface AutomationPayload {
  entity_type: string; // DB table name
  entity_id: string;
  operation: "INSERT" | "UPDATE";
  new_row: Record<string, unknown>;
  old_row: Record<string, unknown> | null;
}

interface TriggerCondition {
  id?: string;
  triggerType: string;
  triggerConfig: {
    when?: string;
    field?: string;
    operator?: string;
    value?: string | number | boolean;
    from_value?: string | number | boolean;
    to_value?: string | number | boolean;
  };
}

interface AutomationAction {
  id: string;
  type: string;
  config: Record<string, unknown>;
  order: number;
  delay_minutes?: number;
}

// Reverse map: DB table name -> automation entity_type
const TABLE_ENTITY_MAP: Record<string, string> = {};
for (const [key, val] of Object.entries(ENTITY_TABLE_MAP)) {
  TABLE_ENTITY_MAP[val] = key;
}

function evaluateCondition(
  condition: TriggerCondition,
  newRow: Record<string, unknown>,
  oldRow: Record<string, unknown> | null,
  operation: string
): boolean {
  const cfg = condition.triggerConfig;
  const field = cfg.field;
  if (!field) return false;

  const newVal = String(newRow[field] ?? "");
  const oldVal = oldRow ? String(oldRow[field] ?? "") : "";
  const targetVal = String(cfg.value ?? cfg.to_value ?? "");
  const operator = cfg.operator || "equals";
  const when = cfg.when || "field_matches";

  // For "field_changes_to" / "changes_to", the field must have changed to the target value
  if (when === "field_changes_to") {
    if (operation === "INSERT") {
      return compareValues(newVal, targetVal, operator);
    }
    // On UPDATE, value must have changed
    return newVal !== oldVal && compareValues(newVal, targetVal, operator);
  }

  // For "field_changes_from_to"
  if (when === "field_changes_from_to") {
    const fromTarget = String(cfg.from_value ?? "");
    return compareValues(oldVal, fromTarget, "equals") && compareValues(newVal, targetVal, "equals");
  }

  // For "record_created"
  if (when === "record_created") {
    return operation === "INSERT";
  }

  // For "any_field_updated"
  if (when === "any_field_updated") {
    return operation === "UPDATE";
  }

  // Default: "field_matches" - just check current value
  return compareValues(newVal, targetVal, operator);
}

function compareValues(actual: string, expected: string, operator: string): boolean {
  const a = actual.toLowerCase();
  const e = expected.toLowerCase();

  switch (operator) {
    case "equals":
      return a === e;
    case "not_equals":
      return a !== e;
    case "contains":
      return a.includes(e);
    case "starts_with":
      return a.startsWith(e);
    case "ends_with":
      return a.endsWith(e);
    case "greater_than":
      return parseFloat(actual) > parseFloat(expected);
    case "less_than":
      return parseFloat(actual) < parseFloat(expected);
    case "is_empty":
      return a === "" || a === "null" || a === "undefined";
    case "is_not_empty":
      return a !== "" && a !== "null" && a !== "undefined";
    default:
      return a === e;
  }
}

function evaluateAllConditions(
  conditions: TriggerCondition[],
  logic: string,
  newRow: Record<string, unknown>,
  oldRow: Record<string, unknown> | null,
  operation: string
): boolean {
  if (!conditions || conditions.length === 0) return true;

  if (logic === "or") {
    return conditions.some((c) => evaluateCondition(c, newRow, oldRow, operation));
  }
  // Default: AND
  return conditions.every((c) => evaluateCondition(c, newRow, oldRow, operation));
}

// Helper: resolve a profile by full_name (new standard) or email (legacy)
async function resolveProfileByNameOrEmail(
  supabase: any,
  value: string
): Promise<{ id: string; email: string } | null> {
  if (!value) return null;
  // Try by full_name first (new standard)
  const { data: byName } = await supabase
    .from("profiles")
    .select("id, email")
    .eq("full_name", value)
    .maybeSingle();
  if (byName) return { id: byName.id, email: byName.email };
  // Fallback: try by email (old records)
  const { data: byEmail } = await supabase
    .from("profiles")
    .select("id, email")
    .eq("email", value)
    .maybeSingle();
  if (byEmail) return { id: byEmail.id, email: byEmail.email };
  return null;
}

async function executeAction(
  supabase: any,
  action: AutomationAction,
  newRow: Record<string, unknown>,
  entityType: string,
  entityId: string,
  ruleId: string
): Promise<{ status: "success" | "failed"; details?: string; error?: string; created_record_id?: string }> {
  try {
    const config = action.config;

    switch (action.type) {
      case "send_notification": {
        // Resolve recipients
        const recipients = config.recipients as string[] | undefined;
        const specificUsers = config.specific_users as string | undefined;
        const title = String(config.title || "Automation Notification");
        const message = String(config.message || "");

        

        // Find user IDs to notify — store as { id (UUID), email } for correct notification user_id
        let resolvedProfiles: { id: string; email: string }[] = [];

        if (specificUsers) {
          const entries = specificUsers.split(",").map((e: string) => e.trim());
          for (const entry of entries) {
            const resolved = await resolveProfileByNameOrEmail(supabase, entry);
            if (resolved) resolvedProfiles.push(resolved);
          }
        }

        if (recipients?.includes("trigger.assigned_to") && newRow.assigned_to) {
          const resolved = await resolveProfileByNameOrEmail(supabase, String(newRow.assigned_to));
          if (resolved) resolvedProfiles.push(resolved);
        }

        if (recipients?.includes("trigger.created_by") && newRow.created_by) {
          const resolved = await resolveProfileByNameOrEmail(supabase, String(newRow.created_by));
          if (resolved) resolvedProfiles.push(resolved);
        }

        // Handle role-based recipient types
        const roleRecipients: string[] = [];
        if (recipients?.includes('all_managers') || recipients?.includes('manager')) {
          roleRecipients.push('manager', 'admin', 'super_admin');
        }
        if (recipients?.includes('all_admins') || recipients?.includes('admin')) {
          roleRecipients.push('admin', 'super_admin');
        }
        if (recipients?.includes('all_sales_team')) {
          roleRecipients.push('sales_user', 'field_agent');
        }
        if (recipients?.includes('all_staff')) {
          roleRecipients.push('manager', 'admin', 'super_admin', 'sales_user', 'field_agent', 'sales_viewer');
        }

        if (roleRecipients.length > 0) {
          const { data: roleProfiles } = await supabase
            .from('profiles')
            .select('id, email')
            .in('role', roleRecipients);

          if (roleProfiles) {
            for (const p of roleProfiles) {
              resolvedProfiles.push({ id: p.id, email: p.email });
            }
          }
        }

        // Deduplicate by email
        const seen = new Set<string>();
        resolvedProfiles = resolvedProfiles.filter(p => {
          if (seen.has(p.email)) return false;
          seen.add(p.email);
          return true;
        });

        console.log(`[Automation] send_notification: resolved ${resolvedProfiles.length} recipients from config:`, JSON.stringify(recipients));
        

        if (resolvedProfiles.length === 0) {
          return { status: "failed", error: "No valid recipients found" };
        }

        const notifications = resolvedProfiles.map((p) => ({
          user_id: p.id,
          title,
          message,
          type: "automation",
          priority: String(config.priority || "normal"),
          entity_type: entityType,
          entity_id: entityId,
          related_automation_rule_id: ruleId,
        }));

        const { data: insertedData, error } = await supabase.from("notifications").insert(notifications).select();
        if (error) return { status: "failed", error: error.message };
        return { status: "success", details: `Notified ${resolvedProfiles.length} user(s)` };
      }

      case "create_task": {
        const taskTitle = String(config.title || "Automated Task");
        const priority = String(config.priority || "Medium");
        const taskType = String(config.type || "Follow-up Call");

        // Resolve assigned_to
        let assignedTo = "";
        const assignType = config.assigned_to_type as string;
        if (assignType === "trigger.assigned_to") {
          assignedTo = String(newRow.assigned_to || newRow.user_email || "");
        } else if (assignType === "trigger.created_by") {
          assignedTo = String(newRow.created_by || newRow.user_email || "");
        } else if (assignType === "specific_user" && config.assigned_to_user) {
          assignedTo = String(config.assigned_to_user);
        }

        if (!assignedTo) {
          assignedTo = String(newRow.assigned_to || newRow.created_by || newRow.user_email || "system");
        }

        // Calculate due date
        let dueDate = new Date().toISOString().split("T")[0];
        const dueDateType = config.due_date_type as string;
        if (dueDateType === "tomorrow") {
          const d = new Date();
          d.setDate(d.getDate() + 1);
          dueDate = d.toISOString().split("T")[0];
        } else if (dueDateType === "relative" && config.due_date_offset) {
          const d = new Date();
          const unit = config.due_date_offset_unit || "days";
          const offset = Number(config.due_date_offset);
          if (unit === "hours") d.setHours(d.getHours() + offset);
          else if (unit === "weeks") d.setDate(d.getDate() + offset * 7);
          else d.setDate(d.getDate() + offset);
          dueDate = d.toISOString().split("T")[0];
        }

        const taskData: Record<string, unknown> = {
          title: taskTitle,
          description: config.description || null,
          type: taskType,
          priority,
          assigned_to: assignedTo,
          created_by: "system",
          due_date: dueDate,
          status: "Pending",
          is_starred: config.is_starred || false,
        };

        // Link to trigger entity if configured
        if (config.link_to_trigger && entityId) {
          taskData.related_entity_type = entityType;
          taskData.related_entity_id = entityId;
          if (entityType === "leads") taskData.lead_id = entityId;

          // Check for existing open task matching the same title and entity
          const { data: existingTask } = await supabase
            .from("tasks")
            .select("id")
            .eq("related_entity_id", entityId)
            .eq("related_entity_type", entityType)
            .eq("title", taskTitle)
            .not("status", "in", ["Completed", "Cancelled"])
            .maybeSingle();

          if (existingTask) {
            return { status: "success", details: "Task already exists — skipped duplicate creation" };
          }
        }

        const { data: task, error } = await supabase.from("tasks").insert(taskData).select("id").maybeSingle();
        if (error) return { status: "failed", error: error.message };
        return { status: "success", details: `Task created: ${taskTitle}`, created_record_id: task?.id };
      }

      case "create_reminder": {
        const reminderTitle = String(config.title || "Automated Reminder");

        let assignedTo = "";
        const assignType = config.assigned_to_type as string;
        if (assignType === "trigger.assigned_to") {
          assignedTo = String(newRow.assigned_to || newRow.user_email || "");
        } else if (assignType === "trigger.created_by") {
          assignedTo = String(newRow.created_by || newRow.user_email || "");
        } else if (assignType === "specific_user" && config.assigned_to_user) {
          assignedTo = String(config.assigned_to_user);
        }
        if (!assignedTo) {
          assignedTo = String(newRow.assigned_to || newRow.created_by || newRow.user_email || "system");
        }

        // Calculate reminder datetime
        let reminderDatetime = new Date();
        if (config.reminder_datetime_type === "relative" && config.reminder_offset) {
          const offset = Number(config.reminder_offset);
          const unit = config.reminder_offset_unit || "hours";
          if (unit === "days") reminderDatetime.setDate(reminderDatetime.getDate() + offset);
          else reminderDatetime.setHours(reminderDatetime.getHours() + offset);
        }

        const reminderData = {
          title: reminderTitle,
          description: config.description || null,
          reminder_datetime: reminderDatetime.toISOString(),
          entity_type: entityType,
          entity_id: entityId,
          assigned_to: assignedTo,
          created_by: assignedTo,
          is_recurring: config.is_recurring || false,
          recurrence_pattern: config.recurrence_pattern || null,
        };

        const { data: reminder, error } = await supabase.from("reminders").insert(reminderData).select("id").maybeSingle();
        if (error) return { status: "failed", error: error.message };
        return { status: "success", details: `Reminder created: ${reminderTitle}`, created_record_id: reminder?.id };
      }

      case "update_field": {
        const field = String(config.field || "");
        const value = config.value;
        const target = config.target || "trigger_record";

        if (!field) return { status: "failed", error: "No field specified" };

        if (target === "trigger_record") {
          const tableName = ENTITY_TABLE_MAP[entityType] || entityType;

          // Capture old value before update (for status changes)
          let oldValue: string | null = null;
          if (field === "status" && entityType === "lead") {
            oldValue = String((newRow as any)?.status || (oldRow as any)?.status || "");
          }

          const { error } = await supabase.from(tableName).update({ [field]: value }).eq("id", entityId);
          if (error) return { status: "failed", error: error.message };

          // Log status changes to activity_log for leads
          if (field === "status" && entityType === "lead") {
            try {
              await supabase.from("activity_log").insert({
                activity_type: "status_change",
                activity_category: "status_change",
                title: `Status changed to ${value}`,
                description: oldValue
                  ? `Changed from ${oldValue} to ${value} by automation rule`
                  : `Changed to ${value} by automation rule`,
                user_name: "Automation",
                lead_id: entityId,
                metadata: JSON.stringify({
                  old_status: oldValue,
                  new_status: value,
                  triggered_by: "automation",
                }),
              });
            } catch (_) { /* non-critical */ }
          }

          return { status: "success", details: `Updated ${field} to ${value}` };
        }

        // Update a related record by following a foreign-key field on the trigger row
        // e.g. on tasks: related_entity_type='leads', related_entity_field='lead_id'
        if (target === "related_record" || target === "related_entity") {
          const relatedType = String(config.related_entity_type || "");
          const relatedField = String(config.related_entity_field || "");
          if (!relatedType || !relatedField) {
            return { status: "failed", error: "related_entity_type and related_entity_field required" };
          }
          const relatedId = newRow[relatedField];
          if (!relatedId) {
            return { status: "success", details: `No ${relatedField} on trigger row — skipped` };
          }
          const relatedTable = ENTITY_TABLE_MAP[relatedType] || relatedType;

          // Optional guard: only update when current value matches expected_current_value
          const expectedCurrent = config.expected_current_value;
          if (expectedCurrent !== undefined && expectedCurrent !== null && expectedCurrent !== "") {
            const { data: currentRow } = await supabase
              .from(relatedTable)
              .select(field)
              .eq("id", relatedId)
              .maybeSingle();
            const currentVal = currentRow ? (currentRow as Record<string, unknown>)[field] : undefined;
            if (String(currentVal ?? "") !== String(expectedCurrent)) {
              return { status: "success", details: `Skipped: ${field} is "${currentVal}", expected "${expectedCurrent}"` };
            }
          }

          const { error } = await supabase
            .from(relatedTable)
            .update({ [field]: value })
            .eq("id", relatedId);
          if (error) return { status: "failed", error: error.message };
          return { status: "success", details: `Updated ${relatedTable}.${field} → ${value} (id=${relatedId})` };
        }

        return { status: "failed", error: `Unsupported target: ${target}` };
      }

      case "handle_lead_tasks": {
        // Find the lead_id from the trigger record
        const leadId = String(newRow.id || newRow.lead_id || entityId);
        const operation = String(config.operation || "cancel_all");
        const taskNote = String(config.task_note || "");

        // Resolve note variables
        const resolvedNote = taskNote
          .replace("{lead_name}", String(newRow.name || ""))
          .replace("{trigger_reason}", String(newRow.lost_reason || ""))
          .replace("{original_assignee}", String(newRow.assigned_to || ""))
          .replace("{new_status}", String(newRow.status || ""));

        // Find all open tasks on this lead
        const { data: openTasks, error: tasksErr } = await supabase
          .from("tasks")
          .select("id, assigned_to, status")
          .eq("lead_id", leadId)
          .not("status", "in", '("Completed","Cancelled")');

        if (tasksErr) return { status: "failed", error: tasksErr.message };
        if (!openTasks || openTasks.length === 0) {
          return { status: "success", details: "No open tasks found on this lead" };
        }

        let updatedCount = 0;
        for (const task of openTasks) {
          let updateData: Record<string, unknown> = {};

          if (operation === "cancel_all") {
            updateData = { status: "Cancelled" };
          } else if (operation === "complete_all") {
            updateData = { status: "Completed", completed_at: new Date().toISOString() };
          } else if (operation === "reassign_all") {
            const reassignTo = String(config.reassign_to_user || newRow.assigned_to || "");
            updateData = { assigned_to: reassignTo };
          }

          if (Object.keys(updateData).length > 0) {
            const { error: upErr } = await supabase.from("tasks").update(updateData).eq("id", task.id);
            if (!upErr) updatedCount++;
          }

          // Add note if provided
          if (resolvedNote && (operation === "add_note_all" || operation === "reassign_all" || operation === "cancel_all")) {
            // Log as activity on the task
            await supabase.from("activity_log").insert({
              activity_type: "automation_note",
              activity_category: "automation",
              title: resolvedNote,
              user_name: "Automation",
              related_entity_type: "task",
              related_entity_id: task.id,
              lead_id: leadId,
            });
          }
        }

        return { status: "success", details: `${operation}: ${updatedCount}/${openTasks.length} tasks updated` };
      }

      default:
        return { status: "failed", error: `Unsupported action type: ${action.type}` };
    }
  } catch (err) {
    return { status: "failed", error: String(err) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload: AutomationPayload = await req.json();
    const { entity_type: dbTable, entity_id, operation, new_row, old_row } = payload;

    console.log(`[Automation] Received: ${operation} on ${dbTable}, id=${entity_id}`);

    // Infinite loop guard: skip if this change was automation-sourced
    // We detect this by checking if new_row has updated_by === 'automation'
    // This is a forward-compatible guard — if field doesn't exist,
    // new_row.updated_by will be undefined, and the check safely passes
    if (new_row && (new_row as any).updated_by === 'automation') {
      console.log('[Automation] Skipping — event sourced from automation');
      return new Response(JSON.stringify({ skipped: true, reason: 'automation_source' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Map DB table name to automation entity_type
    const entityType = TABLE_ENTITY_MAP[dbTable] || dbTable;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient<any>(supabaseUrl, serviceRoleKey);

    // Fetch active automation rules for this entity type
    const { data: rules, error: rulesError } = await supabase
      .from("automation_rules")
      .select("*")
      .eq("entity_type", entityType)
      .eq("is_active", true)
      .order("execution_order", { ascending: true });

    if (rulesError) {
      console.error("[Automation] Error fetching rules:", rulesError);
      return new Response(JSON.stringify({ error: rulesError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!rules || rules.length === 0) {
      console.log(`[Automation] No active rules for entity_type: ${entityType}`);
      return new Response(JSON.stringify({ message: "No matching rules", rules_checked: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[Automation] Found ${rules.length} active rule(s) for ${entityType}`);

    const results: Array<{ rule_id: string; rule_name: string; matched: boolean; actions_run: number }> = [];

    for (const rule of rules) {
      const triggerConfig = rule.trigger_config as {
        conditions?: TriggerCondition[];
        condition_logic?: string;
      };

      const conditions = triggerConfig.conditions || [];
      const conditionLogic = triggerConfig.condition_logic || "and";

      // Check active days
      if (rule.active_days && rule.active_days.length > 0) {
        const dayAbbrevs = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
        const dayFull = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
        const dayIdx = new Date().getDay();
        const today = dayAbbrevs[dayIdx];
        const todayFull = dayFull[dayIdx];
        // Support both abbreviated (mon, tue) and full (monday, tuesday) formats
        if (!rule.active_days.includes(today) && !rule.active_days.includes(todayFull)) {
          console.log(`[Automation] Rule "${rule.rule_name}" skipped: not active on ${today}`);
          results.push({ rule_id: rule.id, rule_name: rule.rule_name, matched: false, actions_run: 0 });
          continue;
        }
      }

      // Evaluate conditions
      const matched = evaluateAllConditions(conditions, conditionLogic, new_row, old_row, operation);

      if (!matched) {
        console.log(`[Automation] Rule "${rule.rule_name}" conditions not met`);
        results.push({ rule_id: rule.id, rule_name: rule.rule_name, matched: false, actions_run: 0 });
        continue;
      }

      console.log(`[Automation] Rule "${rule.rule_name}" MATCHED! Executing actions...`);

      // Check execution limits — atomic lock via INSERT (avoids race condition for "8 times" bug)
      if (rule.execution_limit === "once_per_record") {
        const { error: lockError } = await supabase
          .from("automation_rule_executions_tracking")
          .insert({
            rule_id: rule.id,
            entity_id: entity_id,
            last_executed: new Date().toISOString(),
            execution_count: 1,
          });

        // Unique constraint violation = already executed for this record — skip
        if (lockError && (lockError as any).code === "23505") {
          console.log(`[Automation] Rule "${rule.rule_name}" already executed for this record (lock held)`);
          results.push({ rule_id: rule.id, rule_name: rule.rule_name, matched: true, actions_run: 0 });
          continue;
        }
      }

      // Execute actions
      const actions = (rule.actions as AutomationAction[]) || [];
      const sortedActions = [...actions].sort((a, b) => (a.order || 0) - (b.order || 0));

      const startTime = Date.now();
      const executionLog: Array<Record<string, unknown>> = [];
      let succeeded = 0;
      let failed = 0;

      for (const action of sortedActions) {
        console.log(`[Automation] Executing action: ${action.type}`);
        const result = await executeAction(supabase, action, new_row, entityType, entity_id, rule.id);

        executionLog.push({
          timestamp: new Date().toISOString(),
          action_index: action.order,
          action_type: action.type,
          status: result.status,
          details: result.details,
          error: result.error,
          created_record_id: result.created_record_id,
        });

        if (result.status === "success") succeeded++;
        else failed++;
      }

      const duration = Date.now() - startTime;
      const overallStatus = failed === 0 ? "success" : succeeded === 0 ? "failed" : "partial_success";

      // Log execution
      await supabase.from("automation_executions").insert({
        rule_id: rule.id,
        entity_type: entityType,
        entity_id: entity_id,
        status: overallStatus,
        actions_attempted: sortedActions.length,
        actions_succeeded: succeeded,
        actions_failed: failed,
        execution_duration_ms: duration,
        execution_log: executionLog,
        created_by: "System",
      });

      // For non-once_per_record limits, increment execution_count via UPDATE/UPSERT
      if (rule.execution_limit !== "once_per_record") {
        const { data: existingTracking } = await supabase
          .from("automation_rule_executions_tracking")
          .select("execution_count")
          .eq("rule_id", rule.id)
          .eq("entity_id", entity_id)
          .maybeSingle();

        await supabase.from("automation_rule_executions_tracking").upsert(
          {
            rule_id: rule.id,
            entity_id: entity_id,
            last_executed: new Date().toISOString(),
            execution_count: (existingTracking?.execution_count || 0) + 1,
          },
          { onConflict: "rule_id,entity_id" }
        );
      }

      // Update last_triggered on rule
      await supabase.from("automation_rules").update({ last_triggered: new Date().toISOString() }).eq("id", rule.id);

      results.push({
        rule_id: rule.id,
        rule_name: rule.rule_name,
        matched: true,
        actions_run: sortedActions.length,
      });
    }

    console.log(`[Automation] Completed. Results:`, JSON.stringify(results));

    return new Response(JSON.stringify({ results, rules_checked: rules.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[Automation] Error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
