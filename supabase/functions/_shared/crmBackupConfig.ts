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
  | "kit";

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
    "control_panel_options",
    "control_panel_option_values",
    "saved_filters",
    "saved_filter_monitoring",
    "user_settings",
    "user_status",
    "user_table_preferences",
  ],
  todo: ["todo_lists", "todo_items"],
  attachments_files: ["entity_attachments", "quotation_attachments", "messages"],
  kit: ["kit_subscriptions", "kit_touches", "kit_presets", "kit_outcomes", "kit_touch_methods"],
};

// Deletion order for REPLACE restores: children first.
export const REPLACE_DELETE_ORDER: string[] = [
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
  crm_backups: "id",
  crm_restores: "id",

  // Non-id PKs
  user_roles: "user_id",
  custom_role_permissions: "role",
};
