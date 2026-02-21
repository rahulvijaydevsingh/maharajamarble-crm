// Automation System Constants

import { EntityType, TriggerType, ActionType, EntityField, TemplateVariable } from "@/types/automation";

export const ENTITY_TYPES: { value: EntityType; label: string; icon: string }[] = [
  { value: "leads", label: "Leads", icon: "UserPlus" },
  { value: "tasks", label: "Tasks", icon: "CheckSquare" },
  { value: "customers", label: "Customers", icon: "Users" },
  { value: "professionals", label: "Professionals", icon: "Briefcase" },
  { value: "quotations", label: "Quotations", icon: "FileText" },
  { value: "kit", label: "Keep in Touch", icon: "HeartHandshake" },
  { value: "staff_activity", label: "Staff Activity", icon: "Activity" },
];

export const TRIGGER_TYPES: { value: TriggerType; label: string; description: string; icon: string }[] = [
  { 
    value: "field_change", 
    label: "Field Change", 
    description: "Fires when a specific field value changes",
    icon: "Zap"
  },
  { 
    value: "time_based", 
    label: "Time-Based", 
    description: "Fires after a certain time period or on schedule",
    icon: "Clock"
  },
  { 
    value: "count_based", 
    label: "Count-Based", 
    description: "Fires when record count reaches a threshold",
    icon: "Hash"
  },
  { 
    value: "saved_filter", 
    label: "Saved Filter", 
    description: "Fires when saved filter results change",
    icon: "Filter"
  },
];

export const ACTION_TYPES: { value: ActionType; label: string; description: string; icon: string; category: string }[] = [
  { value: "create_task", label: "Add Task", description: "Create a new task", icon: "CheckSquare", category: "Records" },
  { value: "create_reminder", label: "Add Reminder", description: "Create a new reminder", icon: "Bell", category: "Records" },
  { value: "send_notification", label: "Send Notification", description: "Send in-app, email, or SMS notification", icon: "Bell", category: "Communication" },
  { value: "send_message", label: "Send Message", description: "Send direct message to staff members", icon: "MessageSquare", category: "Communication" },
  { value: "update_field", label: "Update Field Value", description: "Change field values on records", icon: "Edit3", category: "Records" },
  { value: "send_email", label: "Send Email", description: "Send external email with templates", icon: "Mail", category: "Communication" },
  { value: "execute_webhook", label: "Execute Webhook", description: "Call external API endpoints", icon: "Webhook", category: "Integration" },
  { value: "trigger_automation", label: "Trigger Automation", description: "Chain to another automation rule", icon: "RefreshCw", category: "Advanced" },
];

export const FIELD_CHANGE_WHEN_OPTIONS = [
  { value: "field_changes_to", label: "Field value changes to..." },
  { value: "field_changes_from_to", label: "Field value changes from X to Y..." },
  { value: "field_matches", label: "Field currently has value..." },
  { value: "any_field_updated", label: "Any field is updated" },
  { value: "record_created", label: "Record is created" },
  { value: "record_deleted", label: "Record is deleted" },
];

export const FIELD_OPERATORS = [
  { value: "equals", label: "Equals" },
  { value: "not_equals", label: "Not equals" },
  { value: "contains", label: "Contains" },
  { value: "starts_with", label: "Starts with" },
  { value: "ends_with", label: "Ends with" },
  { value: "greater_than", label: "Greater than" },
  { value: "less_than", label: "Less than" },
  { value: "is_empty", label: "Is empty" },
  { value: "is_not_empty", label: "Is not empty" },
];

export const DATE_OPERATORS = [
  { value: "equals", label: "Is" },
  { value: "before", label: "Before" },
  { value: "after", label: "After" },
  { value: "is_empty", label: "Is empty" },
  { value: "is_not_empty", label: "Is not empty" },
];

export const TIME_OFFSET_UNITS = [
  { value: "minutes", label: "Minutes" },
  { value: "hours", label: "Hours" },
  { value: "days", label: "Days" },
  { value: "weeks", label: "Weeks" },
  { value: "months", label: "Months" },
];

export const TIME_OFFSET_DIRECTIONS = [
  { value: "before", label: "Before" },
  { value: "after", label: "After" },
];

export const CHECK_FREQUENCY_OPTIONS = [
  { value: "realtime", label: "Real-time (on any record update)" },
  { value: "15min", label: "Every 15 minutes" },
  { value: "hourly", label: "Hourly" },
  { value: "daily", label: "Daily" },
];

export const THRESHOLD_OPERATORS = [
  { value: "greater_than", label: "Greater than" },
  { value: "less_than", label: "Less than" },
  { value: "equals", label: "Equals" },
  { value: "between", label: "Between" },
];

export const SAVED_FILTER_CONDITIONS = [
  { value: "count_above", label: "Count increases above" },
  { value: "count_below", label: "Count decreases below" },
  { value: "count_changes_by", label: "Count changes by X or more" },
  { value: "record_added", label: "Any record is added to filter" },
  { value: "record_removed", label: "Any record is removed from filter" },
];

export const EXECUTION_LIMIT_OPTIONS = [
  { value: "unlimited", label: "Every time condition is met" },
  { value: "once_per_record", label: "Once per record (never repeat)" },
  { value: "once_daily", label: "Once per day per record" },
  { value: "max_limit", label: "Maximum X times per record" },
];

export const DAYS_OF_WEEK = [
  { value: "mon", label: "Mon", fullLabel: "Monday" },
  { value: "tue", label: "Tue", fullLabel: "Tuesday" },
  { value: "wed", label: "Wed", fullLabel: "Wednesday" },
  { value: "thu", label: "Thu", fullLabel: "Thursday" },
  { value: "fri", label: "Fri", fullLabel: "Friday" },
  { value: "sat", label: "Sat", fullLabel: "Saturday" },
  { value: "sun", label: "Sun", fullLabel: "Sunday" },
];

export const NOTIFICATION_PRIORITIES = [
  { value: "normal", label: "Normal", description: "Standard notification" },
  { value: "important", label: "Important", description: "Highlighted in notification center" },
  { value: "urgent", label: "Urgent", description: "Shows as banner with sound" },
];

export const RECIPIENT_OPTIONS = [
  { value: "trigger.assigned_to", label: "Assigned User (from trigger record)" },
  { value: "trigger.created_by", label: "Created By (from trigger record)" },
  { value: "specific_user", label: "Specific User(s)" },
  { value: "all_managers", label: "All Managers" },
  { value: "all_sales_team", label: "All Sales Team" },
  { value: "custom_email", label: "Custom Email Address(es)" },
];

export const RECORD_TYPES_FOR_CREATE = [
  { value: "task", label: "Task", icon: "CheckSquare" },
  { value: "reminder", label: "Reminder", icon: "Bell" },
  { value: "note", label: "Note", icon: "StickyNote" },
];

export const WEBHOOK_METHODS = [
  { value: "POST", label: "POST" },
  { value: "PUT", label: "PUT" },
  { value: "PATCH", label: "PATCH" },
  { value: "GET", label: "GET" },
];

export const WEBHOOK_RETRY_OPTIONS = [
  { value: "none", label: "No retry" },
  { value: "retry_3", label: "Retry 3 times (5 min intervals)" },
  { value: "retry_5", label: "Retry 5 times (exponential backoff)" },
];

export const WEBHOOK_ERROR_HANDLING = [
  { value: "ignore", label: "Ignore errors and continue" },
  { value: "stop", label: "Stop automation on error" },
  { value: "notify", label: "Send notification on error" },
];

export const EMAIL_SEND_TIMING = [
  { value: "immediately", label: "Immediately" },
  { value: "delayed", label: "Delayed (+X hours/days)" },
  { value: "scheduled", label: "At specific date/time" },
];

// Entity-specific field definitions with ALL database fields
export const ENTITY_FIELDS: Record<EntityType, EntityField[]> = {
  leads: [
    { name: "name", label: "Name", type: "text", required: true, editable: true },
    { name: "phone", label: "Phone", type: "text", required: true, editable: true },
    { name: "alternate_phone", label: "Alternate Phone", type: "text", editable: true },
    { name: "email", label: "Email", type: "text", editable: true },
    { name: "status", label: "Status", type: "select", editable: true, options: [
      { value: "new", label: "New" },
      { value: "contacted", label: "Contacted" },
      { value: "qualified", label: "Qualified" },
      { value: "negotiation", label: "Negotiation" },
      { value: "quoted", label: "Quoted" },
      { value: "won", label: "Won" },
      { value: "lost", label: "Lost" },
      { value: "dead", label: "Dead" },
    ]},
    { name: "source", label: "Source", type: "select", editable: true, options: [
      { value: "walk_in", label: "Walk-in" },
      { value: "field_visit", label: "Field Visit" },
      { value: "cold_call", label: "Cold Call" },
      { value: "online_enquiry", label: "Online Enquiry" },
      { value: "professional_referral", label: "Professional Referral" },
    ]},
    { name: "designation", label: "Designation", type: "select", editable: true, options: [
      { value: "owner", label: "Owner" },
      { value: "family_member", label: "Family Member" },
      { value: "architect", label: "Architect" },
      { value: "builder", label: "Builder" },
      { value: "contractor", label: "Contractor" },
      { value: "interior_designer", label: "Interior Designer" },
      { value: "site_supervisor", label: "Site Supervisor" },
      { value: "real_estate_developer", label: "Real Estate Developer" },
      { value: "other", label: "Other" },
    ]},
    { name: "construction_stage", label: "Construction Stage", type: "select", editable: true, options: [
      { value: "excavation", label: "Excavation" },
      { value: "structure_complete", label: "Structure Complete" },
      { value: "plastering", label: "Plastering" },
      { value: "flooring_ready", label: "Flooring Ready" },
      { value: "renovation", label: "Renovation" },
    ]},
    { name: "material_interests", label: "Material Interests", type: "array", editable: true, options: [
      { value: "italian_marble", label: "Italian Marble" },
      { value: "granite_south", label: "Granite (South)" },
      { value: "granite_north", label: "Granite (North)" },
      { value: "quartz", label: "Quartz" },
      { value: "sandstone", label: "Sandstone" },
      { value: "tiles", label: "Tiles" },
      { value: "onyx", label: "Onyx" },
      { value: "engineered_marble", label: "Engineered Marble" },
      { value: "cladding_stone", label: "Cladding Stone" },
      { value: "wooden_flooring", label: "Wooden Flooring" },
    ]},
    { name: "priority", label: "Priority", type: "select", editable: true, options: [
      { value: "1", label: "Very High" },
      { value: "2", label: "High" },
      { value: "3", label: "Medium" },
      { value: "4", label: "Low" },
      { value: "5", label: "Very Low" },
    ]},
    { name: "assigned_to", label: "Assigned To", type: "select", editable: true, options: [
      { value: "vijay.kumar", label: "Vijay Kumar" },
      { value: "ankit.sharma", label: "Ankit Sharma" },
      { value: "sanjay.patel", label: "Sanjay Patel" },
      { value: "meera.singh", label: "Meera Singh" },
    ]},
    { name: "firm_name", label: "Firm Name", type: "text", editable: true },
    { name: "site_location", label: "Site Location", type: "text", editable: true },
    { name: "site_plus_code", label: "Site Plus Code", type: "text", editable: true },
    { name: "address", label: "Address", type: "text", editable: true },
    { name: "estimated_quantity", label: "Estimated Quantity", type: "number", editable: true },
    { name: "notes", label: "Notes", type: "text", editable: true },
    { name: "next_follow_up", label: "Next Follow-up", type: "datetime", editable: true },
    { name: "last_follow_up", label: "Last Follow-up", type: "datetime", editable: false },
    { name: "created_at", label: "Created At", type: "datetime", editable: false },
    { name: "updated_at", label: "Updated At", type: "datetime", editable: false },
    { name: "created_by", label: "Created By", type: "select", editable: false, options: [
      { value: "vijay.kumar", label: "Vijay Kumar" },
      { value: "ankit.sharma", label: "Ankit Sharma" },
      { value: "sanjay.patel", label: "Sanjay Patel" },
      { value: "meera.singh", label: "Meera Singh" },
    ]},
    // Cross-entity computed fields
    { name: "task_count", label: "Associated Task Count", type: "number", editable: false },
    { name: "reminder_count", label: "Associated Reminder Count", type: "number", editable: false },
    { name: "quotation_count", label: "Associated Quotation Count", type: "number", editable: false },
    { name: "days_without_task", label: "Days Without Any Task", type: "number", editable: false },
  ],
  tasks: [
    { name: "title", label: "Title", type: "text", required: true, editable: true },
    { name: "description", label: "Description", type: "text", editable: true },
    { name: "type", label: "Type", type: "select", editable: true, options: [
      { value: "Follow-up Call", label: "Follow-up Call" },
      { value: "Follow-up Meeting", label: "Follow-up Meeting" },
      { value: "Sample Delivery", label: "Sample Delivery" },
      { value: "Site Visit", label: "Site Visit" },
      { value: "Quotation Preparation", label: "Quotation Preparation" },
      { value: "Payment Follow-up", label: "Payment Follow-up" },
      { value: "Delivery Coordination", label: "Delivery Coordination" },
      { value: "Feedback Collection", label: "Feedback Collection" },
      { value: "Professional Outreach", label: "Professional Outreach" },
      { value: "Other", label: "Other" },
    ]},
    { name: "status", label: "Status", type: "select", editable: true, options: [
      { value: "Pending", label: "Pending" },
      { value: "In Progress", label: "In Progress" },
      { value: "Completed", label: "Completed" },
      { value: "Cancelled", label: "Cancelled" },
    ]},
    { name: "priority", label: "Priority", type: "select", editable: true, options: [
      { value: "High", label: "High" },
      { value: "Medium", label: "Medium" },
      { value: "Low", label: "Low" },
    ]},
    { name: "assigned_to", label: "Assigned To", type: "select", editable: true, options: [
      { value: "vijay.kumar", label: "Vijay Kumar" },
      { value: "ankit.sharma", label: "Ankit Sharma" },
      { value: "sanjay.patel", label: "Sanjay Patel" },
      { value: "meera.singh", label: "Meera Singh" },
    ]},
    { name: "due_date", label: "Due Date", type: "date", editable: true },
    { name: "due_time", label: "Due Time", type: "text", editable: true },
    { name: "is_starred", label: "Starred", type: "boolean", editable: true },
    { name: "is_recurring", label: "Recurring", type: "boolean", editable: true },
    { name: "reminder", label: "Reminder Enabled", type: "boolean", editable: true },
    { name: "reminder_time", label: "Reminder Time", type: "text", editable: true },
    { name: "related_entity_type", label: "Related Entity Type", type: "select", editable: true, options: [
      { value: "lead", label: "Lead" },
      { value: "customer", label: "Customer" },
      { value: "professional", label: "Professional" },
      { value: "quotation", label: "Quotation" },
    ]},
    { name: "lead_id", label: "Related Lead", type: "text", editable: true },
    { name: "related_entity_id", label: "Related Entity ID", type: "text", editable: true },
    { name: "snoozed_until", label: "Snoozed Until", type: "datetime", editable: true },
    { name: "completed_at", label: "Completed At", type: "datetime", editable: false },
    { name: "created_at", label: "Created At", type: "datetime", editable: false },
    { name: "created_by", label: "Created By", type: "select", editable: false, options: [
      { value: "vijay.kumar", label: "Vijay Kumar" },
      { value: "ankit.sharma", label: "Ankit Sharma" },
      { value: "sanjay.patel", label: "Sanjay Patel" },
      { value: "meera.singh", label: "Meera Singh" },
    ]},
  ],
  customers: [
    { name: "name", label: "Name", type: "text", required: true, editable: true },
    { name: "phone", label: "Phone", type: "text", required: true, editable: true },
    { name: "alternate_phone", label: "Alternate Phone", type: "text", editable: true },
    { name: "email", label: "Email", type: "text", editable: true },
    { name: "company_name", label: "Company Name", type: "text", editable: true },
    { name: "status", label: "Status", type: "select", editable: true, options: [
      { value: "active", label: "Active" },
      { value: "inactive", label: "Inactive" },
      { value: "vip", label: "VIP" },
    ]},
    { name: "customer_type", label: "Customer Type", type: "select", editable: true, options: [
      { value: "individual", label: "Individual" },
      { value: "business", label: "Business" },
      { value: "contractor", label: "Contractor" },
    ]},
    { name: "priority", label: "Priority", type: "select", editable: true, options: [
      { value: "1", label: "Very High" },
      { value: "2", label: "High" },
      { value: "3", label: "Medium" },
      { value: "4", label: "Low" },
      { value: "5", label: "Very Low" },
    ]},
    { name: "source", label: "Source", type: "text", editable: true },
    { name: "industry", label: "Industry", type: "text", editable: true },
    { name: "total_spent", label: "Total Spent", type: "number", editable: false },
    { name: "total_orders", label: "Total Orders", type: "number", editable: false },
    { name: "assigned_to", label: "Assigned To", type: "select", editable: true, options: [
      { value: "vijay.kumar", label: "Vijay Kumar" },
      { value: "ankit.sharma", label: "Ankit Sharma" },
      { value: "sanjay.patel", label: "Sanjay Patel" },
      { value: "meera.singh", label: "Meera Singh" },
    ]},
    { name: "city", label: "City", type: "text", editable: true },
    { name: "address", label: "Address", type: "text", editable: true },
    { name: "notes", label: "Notes", type: "text", editable: true },
    { name: "next_follow_up", label: "Next Follow-up", type: "datetime", editable: true },
    { name: "last_follow_up", label: "Last Follow-up", type: "datetime", editable: false },
    { name: "last_purchase", label: "Last Purchase", type: "datetime", editable: false },
    { name: "created_at", label: "Created At", type: "datetime", editable: false },
    { name: "created_by", label: "Created By", type: "select", editable: false, options: [
      { value: "vijay.kumar", label: "Vijay Kumar" },
      { value: "ankit.sharma", label: "Ankit Sharma" },
      { value: "sanjay.patel", label: "Sanjay Patel" },
      { value: "meera.singh", label: "Meera Singh" },
    ]},
  ],
  professionals: [
    { name: "name", label: "Name", type: "text", required: true, editable: true },
    { name: "phone", label: "Phone", type: "text", required: true, editable: true },
    { name: "alternate_phone", label: "Alternate Phone", type: "text", editable: true },
    { name: "email", label: "Email", type: "text", editable: true },
    { name: "firm_name", label: "Firm Name", type: "text", editable: true },
    { name: "professional_type", label: "Professional Type", type: "select", editable: true, options: [
      { value: "architect", label: "Architect" },
      { value: "builder", label: "Builder" },
      { value: "contractor", label: "Contractor" },
      { value: "interior_designer", label: "Interior Designer" },
    ]},
    { name: "status", label: "Status", type: "select", editable: true, options: [
      { value: "active", label: "Active" },
      { value: "inactive", label: "Inactive" },
      { value: "preferred", label: "Preferred" },
    ]},
    { name: "priority", label: "Priority", type: "select", editable: true, options: [
      { value: "1", label: "Very High" },
      { value: "2", label: "High" },
      { value: "3", label: "Medium" },
      { value: "4", label: "Low" },
      { value: "5", label: "Very Low" },
    ]},
    { name: "service_category", label: "Service Category", type: "text", editable: true },
    { name: "rating", label: "Rating", type: "number", editable: true },
    { name: "total_projects", label: "Total Projects", type: "number", editable: false },
    { name: "assigned_to", label: "Assigned To", type: "select", editable: true, options: [
      { value: "vijay.kumar", label: "Vijay Kumar" },
      { value: "ankit.sharma", label: "Ankit Sharma" },
      { value: "sanjay.patel", label: "Sanjay Patel" },
      { value: "meera.singh", label: "Meera Singh" },
    ]},
    { name: "city", label: "City", type: "text", editable: true },
    { name: "address", label: "Address", type: "text", editable: true },
    { name: "notes", label: "Notes", type: "text", editable: true },
    { name: "next_follow_up", label: "Next Follow-up", type: "datetime", editable: true },
    { name: "last_follow_up", label: "Last Follow-up", type: "datetime", editable: false },
    { name: "created_at", label: "Created At", type: "datetime", editable: false },
    { name: "created_by", label: "Created By", type: "select", editable: false, options: [
      { value: "vijay.kumar", label: "Vijay Kumar" },
      { value: "ankit.sharma", label: "Ankit Sharma" },
      { value: "sanjay.patel", label: "Sanjay Patel" },
      { value: "meera.singh", label: "Meera Singh" },
    ]},
  ],
  quotations: [
    { name: "quotation_number", label: "Quotation Number", type: "text", editable: false },
    { name: "client_name", label: "Client Name", type: "text", required: true, editable: true },
    { name: "client_phone", label: "Client Phone", type: "text", editable: true },
    { name: "client_email", label: "Client Email", type: "text", editable: true },
    { name: "client_address", label: "Client Address", type: "text", editable: true },
    { name: "client_type", label: "Client Type", type: "select", editable: true, options: [
      { value: "lead", label: "Lead" },
      { value: "customer", label: "Customer" },
      { value: "professional", label: "Professional" },
    ]},
    { name: "status", label: "Status", type: "select", editable: true, options: [
      { value: "draft", label: "Draft" },
      { value: "sent", label: "Sent" },
      { value: "accepted", label: "Accepted" },
      { value: "rejected", label: "Rejected" },
      { value: "expired", label: "Expired" },
    ]},
    { name: "subtotal", label: "Subtotal", type: "number", editable: false },
    { name: "gst_percentage", label: "GST %", type: "number", editable: true },
    { name: "gst_amount", label: "GST Amount", type: "number", editable: false },
    { name: "total", label: "Total", type: "number", editable: false },
    { name: "assigned_to", label: "Assigned To", type: "select", editable: true, options: [
      { value: "vijay.kumar", label: "Vijay Kumar" },
      { value: "ankit.sharma", label: "Ankit Sharma" },
      { value: "sanjay.patel", label: "Sanjay Patel" },
      { value: "meera.singh", label: "Meera Singh" },
    ]},
    { name: "notes", label: "Notes", type: "text", editable: true },
    { name: "quotation_date", label: "Quotation Date", type: "date", editable: true },
    { name: "valid_until", label: "Valid Until", type: "date", editable: true },
    { name: "created_at", label: "Created At", type: "datetime", editable: false },
    { name: "created_by", label: "Created By", type: "select", editable: false, options: [
      { value: "vijay.kumar", label: "Vijay Kumar" },
      { value: "ankit.sharma", label: "Ankit Sharma" },
      { value: "sanjay.patel", label: "Sanjay Patel" },
      { value: "meera.singh", label: "Meera Singh" },
    ]},
  ],
  kit: [
    { name: "entity_type", label: "Entity Type", type: "select", editable: false, options: [
      { value: "lead", label: "Lead" },
      { value: "customer", label: "Customer" },
      { value: "professional", label: "Professional" },
    ]},
    { name: "status", label: "Status", type: "select", editable: true, options: [
      { value: "active", label: "Active" },
      { value: "paused", label: "Paused" },
      { value: "completed", label: "Completed" },
      { value: "cancelled", label: "Cancelled" },
    ]},
    { name: "assigned_to", label: "Assigned To", type: "select", editable: true, options: [] },
    { name: "current_step", label: "Current Step", type: "number", editable: false },
    { name: "cycle_count", label: "Cycle Count", type: "number", editable: false },
    { name: "created_at", label: "Created At", type: "datetime", editable: false },
    { name: "created_by", label: "Created By", type: "text", editable: false },
  ],
  staff_activity: [
    { name: "action_type", label: "Action Type", type: "select", editable: false, options: [
      { value: "login", label: "Login" },
      { value: "logout", label: "Logout" },
      { value: "create_lead", label: "Create Lead" },
      { value: "update_lead", label: "Update Lead" },
      { value: "create_task", label: "Create Task" },
      { value: "update_task", label: "Update Task" },
      { value: "complete_task", label: "Complete Task" },
      { value: "create_customer", label: "Create Customer" },
      { value: "update_customer", label: "Update Customer" },
      { value: "create_quotation", label: "Create Quotation" },
      { value: "create_reminder", label: "Create Reminder" },
      { value: "transfer_responsibility", label: "Transfer Responsibility" },
    ]},
    { name: "user_email", label: "Staff Member", type: "select", editable: false, options: [] },
    { name: "entity_type", label: "Related Entity Type", type: "select", editable: false, options: [
      { value: "lead", label: "Lead" },
      { value: "task", label: "Task" },
      { value: "customer", label: "Customer" },
      { value: "professional", label: "Professional" },
      { value: "quotation", label: "Quotation" },
      { value: "reminder", label: "Reminder" },
    ]},
    { name: "action_description", label: "Description", type: "text", editable: false },
    { name: "created_at", label: "Timestamp", type: "datetime", editable: false },
  ],
};

// Task types for action configuration
export const TASK_TYPES = [
  { value: "Follow-up Call", label: "Follow-up Call" },
  { value: "Follow-up Meeting", label: "Follow-up Meeting" },
  { value: "Sample Delivery", label: "Sample Delivery" },
  { value: "Site Visit", label: "Site Visit" },
  { value: "Quotation Preparation", label: "Quotation Preparation" },
  { value: "Payment Follow-up", label: "Payment Follow-up" },
  { value: "Delivery Coordination", label: "Delivery Coordination" },
  { value: "Feedback Collection", label: "Feedback Collection" },
  { value: "Professional Outreach", label: "Professional Outreach" },
  { value: "Other", label: "Other" },
];

// Due date calculation options
export const DUE_DATE_OPTIONS = [
  { value: "today", label: "Today" },
  { value: "tomorrow", label: "Tomorrow" },
  { value: "relative", label: "Relative (+X days/hours)" },
  { value: "from_field", label: "Relative to trigger field" },
  { value: "absolute", label: "Specific date" },
];

// Assignee options for task creation
export const ASSIGNEE_OPTIONS = [
  { value: "trigger.assigned_to", label: "Same as trigger record's assigned_to" },
  { value: "trigger.created_by", label: "Record creator" },
  { value: "specific_user", label: "Specific user" },
  { value: "round_robin", label: "Round-robin assignment" },
];

// Reminder timing options
export const REMINDER_TIMING_OPTIONS = [
  { value: "5", label: "5 minutes before" },
  { value: "15", label: "15 minutes before" },
  { value: "30", label: "30 minutes before" },
  { value: "60", label: "1 hour before" },
  { value: "120", label: "2 hours before" },
  { value: "1440", label: "1 day before" },
];

// Template Variables
export const TEMPLATE_VARIABLES: TemplateVariable[] = [
  // Trigger Record Variables
  { name: "trigger.id", label: "Record ID", category: "trigger" },
  { name: "trigger.name", label: "Name", category: "trigger", example: "John Doe" },
  { name: "trigger.phone", label: "Phone", category: "trigger", example: "+91 9876543210" },
  { name: "trigger.email", label: "Email", category: "trigger", example: "john@example.com" },
  { name: "trigger.status", label: "Status", category: "trigger", example: "new" },
  { name: "trigger.priority", label: "Priority", category: "trigger", example: "High" },
  { name: "trigger.assigned_to", label: "Assigned To", category: "trigger", example: "Vijay Kumar" },
  { name: "trigger.created_by", label: "Created By", category: "trigger" },
  { name: "trigger.title", label: "Title (Tasks)", category: "trigger", example: "Follow up call" },
  { name: "trigger.quotation_number", label: "Quotation Number", category: "trigger", example: "QUO-0001" },
  
  // Related Variables
  { name: "trigger.assigned_to.name", label: "Assigned User Name", category: "related" },
  { name: "trigger.assigned_to.email", label: "Assigned User Email", category: "related" },
  { name: "trigger.referred_by.name", label: "Referrer Name", category: "related" },
  
  // Date/Time Variables
  { name: "current_date", label: "Current Date", category: "datetime", example: "2025-12-31" },
  { name: "current_time", label: "Current Time", category: "datetime", example: "14:30" },
  { name: "current_datetime", label: "Current Date/Time", category: "datetime" },
  { name: "days_since_created", label: "Days Since Created", category: "datetime", example: "5" },
  { name: "days_until_due", label: "Days Until Due", category: "datetime", example: "3" },
  
  // System Variables
  { name: "system_name", label: "System Name", category: "system", example: "CRM System" },
  { name: "base_url", label: "Base URL", category: "system" },
  { name: "filter.count", label: "Filter Count (Saved Filter triggers)", category: "system", example: "25" },
];

export const EXECUTION_STATUS_COLORS: Record<string, { bg: string; text: string; icon: string }> = {
  success: { bg: "bg-green-100", text: "text-green-800", icon: "CheckCircle" },
  failed: { bg: "bg-red-100", text: "text-red-800", icon: "XCircle" },
  partial_success: { bg: "bg-yellow-100", text: "text-yellow-800", icon: "AlertCircle" },
  in_progress: { bg: "bg-blue-100", text: "text-blue-800", icon: "Loader" },
};
