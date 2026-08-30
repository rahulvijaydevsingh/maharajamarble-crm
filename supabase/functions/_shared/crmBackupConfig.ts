export type BackupModuleKey =
  | "leads"
  | "customers"
  | "professionals"
  | "tasks"
  | "reminders"
  | "quotations"
  | "automation"
  | "communication"
  | "users_access"
  | "company_system"
  | "todo"
  | "attachments_files"
  | "kit"
  | "performance"
  | "staff_logs"
  | "whatsapp"
  | "hr_attendance"
  | "api_access";


export const BACKUP_MODULES: Array<{ key: BackupModuleKey; label: string; description: string }> = [
  { key: "leads", label: "Leads", description: "Leads + related activity" },
  { key: "customers", label: "Customers", description: "Customers + related activity" },
  { key: "professionals", label: "Professionals", description: "Professionals records" },
  { key: "tasks", label: "Tasks", description: "Tasks + subtasks + task logs" },
  { key: "reminders", label: "Reminders", description: "Reminders" },
  { key: "quotations", label: "Quotations", description: "Quotations + items + attachments" },
  { key: "automation", label: "Automation", description: "Automation rules + templates + execution logs" },
  { key: "communication", label: "Communication", description: "Messages, conversations, announcements" },
  { key: "users_access", label: "Users & Access", description: "Profiles, roles, permissions" },
  { key: "company_system", label: "Company & System", description: "Company settings, control panel, filters" },
  { key: "todo", label: "Todo Lists", description: "Todo lists and items" },
  { key: "attachments_files", label: "Attachments/Files", description: "Attachment metadata + stored objects" },
  { key: "kit", label: "Keep in Touch", description: "KIT subscriptions, touches, presets" },
  { key: "performance", label: "Performance", description: "Performance targets, notes, triggers, widget prefs" },
  { key: "staff_logs", label: "Staff Activity Logs", description: "Staff activity log + notifications" },
  { key: "whatsapp", label: "WhatsApp", description: "WhatsApp settings, sessions, messages, queue" },
  { key: "hr_attendance", label: "HR & Attendance", description: "Attendance logs, clock-in/out history, and leave tracking" },
  { key: "api_access", label: "API Access", description: "API keys and rate limits" },
];


export const MODULE_TO_TABLES: Record<BackupModuleKey, string[]> = {
  leads: ["leads", "activity_log"],
  customers: ["customers", "activity_log"],
  professionals: ["professionals"],
  tasks: [
    "tasks",
    "task_subtasks",
    "task_activity_log",
    "task_snooze_history",
    "task_completion_templates",
  ],
  reminders: ["reminders"],
  quotations: ["quotations", "quotation_items", "quotation_attachments"],
  automation: [
    "automation_rules",
    "automation_templates",
    "automation_settings",
    "automation_executions",
    "automation_rule_executions_tracking",
  ],
  communication: ["conversations", "messages", "announcements", "announcement_reads"],
  users_access: ["profiles", "user_roles", "custom_role_permissions"],
  company_system: [
    "company_settings",
    "system_settings",
    "control_panel_options",
    "control_panel_option_values",
    "saved_filters",
    "saved_filter_monitoring",
    "user_settings",
    "user_status",
    "user_table_preferences",
    "lead_lost_reasons",
  ],
  todo: ["todo_lists", "todo_items"],
  attachments_files: ["entity_attachments", "quotation_attachments", "messages"],
  kit: ["kit_subscriptions", "kit_touches", "kit_presets", "kit_outcomes", "kit_touch_methods"],
  performance: ["performance_targets", "staff_performance_notes", "performance_trigger_log", "widget_preferences"],
  staff_logs: ["staff_activity_log", "notifications"],
  whatsapp: ["whatsapp_settings", "whatsapp_sessions", "whatsapp_messages", "whatsapp_queue"],
  hr_attendance: [
    "staff_hr_settings",
    "attendance_records",
    "leave_balances",
    "leave_requests",
    "salary_records",
    "public_holidays",
    "work_delegations",
  ],
  api_access: ["api_keys", "api_rate_limits"],
};


// Deletion order for REPLACE restores: children first.
export const REPLACE_DELETE_ORDER: string[] = [
  // WhatsApp
  "whatsapp_queue",
  "whatsapp_messages",
  "whatsapp_sessions",
  "whatsapp_settings",
  // Performance
  "performance_trigger_log",
  "widget_preferences",
  "staff_performance_notes",
  "performance_targets",
  // Staff logs
  "staff_activity_log",
  // Existing
  "announcement_reads",
  "messages",
  "conversations",
  "notifications",
  "automation_rule_executions_tracking",
  "automation_executions",
  "automation_rules",
  "automation_templates",
  "automation_settings",
  "quotation_items",
  "quotation_attachments",
  "quotations",
  "task_subtasks",
  "task_activity_log",
  "task_snooze_history",
  "tasks",
  "reminders",
  "todo_items",
  "todo_lists",
  "entity_attachments",
  "professionals",
  "customers",
  "leads",
  "saved_filter_monitoring",
  "saved_filters",
  "control_panel_option_values",
  "control_panel_options",
  "company_settings",
  "custom_role_permissions",
  "user_roles",
  "profiles",
  "user_settings",
  "user_status",
  "user_table_preferences",
  "announcements",
  "activity_log",
  "kit_touches",
  "kit_subscriptions",
  "kit_presets",
  "kit_outcomes",
  "kit_touch_methods",
  // HR & Attendance
  "salary_records",
  "leave_requests",
  "leave_balances",
  "attendance_records",
  "work_delegations",
  "public_holidays",
  "staff_hr_settings",
  // System extras
  "system_settings",
  "lead_lost_reasons",
  // API
  "api_rate_limits",
  "api_keys",
];


// Insert order for restores: parents first.
export const RESTORE_INSERT_ORDER: string[] = [
  "profiles",
  "user_roles",
  "custom_role_permissions",
  "company_settings",
  "control_panel_options",
  "control_panel_option_values",
  "saved_filters",
  "saved_filter_monitoring",
  "leads",
  "customers",
  "professionals",
  "tasks",
  "task_subtasks",
  "task_snooze_history",
  "task_activity_log",
  "task_completion_templates",
  "reminders",
  "todo_lists",
  "todo_items",
  "quotations",
  "quotation_items",
  "quotation_attachments",
  "automation_settings",
  "automation_templates",
  "automation_rules",
  "automation_executions",
  "automation_rule_executions_tracking",
  "announcements",
  "announcement_reads",
  "conversations",
  "messages",
  "activity_log",
  "entity_attachments",
  "user_settings",
  "user_status",
  "user_table_preferences",
  "notifications",
  "kit_outcomes",
  "kit_touch_methods",
  "kit_presets",
  "kit_subscriptions",
  "kit_touches",
  // Performance
  "performance_targets",
  "staff_performance_notes",
  "performance_trigger_log",
  "widget_preferences",
  // Staff logs
  "staff_activity_log",
  // WhatsApp
  "whatsapp_settings",
  "whatsapp_sessions",
  "whatsapp_messages",
  "whatsapp_queue",
  // System extras
  "system_settings",
  "lead_lost_reasons",
  // HR & Attendance
  "staff_hr_settings",
  "public_holidays",
  "attendance_records",
  "leave_balances",
  "leave_requests",
  "salary_records",
  "work_delegations",
  // API
  "api_keys",
  "api_rate_limits",
];


export const UPSERT_CONFLICT_TARGET: Record<string, string> = {
  // Common
  profiles: "id",
  leads: "id",
  customers: "id",
  professionals: "id",
  tasks: "id",
  task_subtasks: "id",
  task_activity_log: "id",
  task_snooze_history: "id",
  task_completion_templates: "id",
  reminders: "id",
  quotations: "id",
  quotation_items: "id",
  quotation_attachments: "id",
  entity_attachments: "id",
  announcements: "id",
  announcement_reads: "id",
  conversations: "id",
  messages: "id",
  saved_filters: "id",
  saved_filter_monitoring: "id",
  control_panel_options: "id",
  control_panel_option_values: "id",
  crm_backups_legacy: "id",
  crm_restores_legacy: "id",

  // KIT
  kit_subscriptions: "id",
  kit_touches: "id",
  kit_presets: "id",
  kit_outcomes: "id",
  kit_touch_methods: "id",

  // Performance
  performance_targets: "id",
  staff_performance_notes: "id",
  performance_trigger_log: "id",
  widget_preferences: "id",

  // Staff logs
  staff_activity_log: "id",
  notifications: "id",

  // WhatsApp
  whatsapp_settings: "id",
  whatsapp_sessions: "id",
  whatsapp_messages: "id",
  whatsapp_queue: "id",

  // Non-id PKs
  user_roles: "user_id",
  custom_role_permissions: "role",

  // HR & Attendance
  staff_hr_settings: "id",
  attendance_records: "id",
  leave_balances: "id",
  leave_requests: "id",
  salary_records: "id",
  public_holidays: "id",
  work_delegations: "id",

  // System extras
  system_settings: "id",
  lead_lost_reasons: "id",

  // API
  api_keys: "id",
  api_rate_limits: "id",
};


// Tables that must never appear in a backup payload.
// crm_backups / crm_restores are operational metadata, not business data.
// auth.* is managed separately via Supabase Auth dashboard export.
export const BACKUP_EXCLUDED_TABLES: Set<string> = new Set([
  "crm_backups_legacy",
  "crm_restores_legacy",
  "schema_migrations",
  "supabase_migrations",
]);


export function dedupeTables(modules: BackupModuleKey[]): string[] {
  const set = new Set<string>();
  for (const m of modules) {
    for (const t of MODULE_TO_TABLES[m] || []) set.add(t);
  }
  return [...set];
}
