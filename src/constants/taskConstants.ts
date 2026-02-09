// Task Management Constants
// All dropdown options are defined here for consistency
// These should eventually be managed via Control Panel

export const TASK_TYPES = [
  "Follow-up Call",
  "Follow-up Meeting", 
  "Sample Delivery",
  "Site Visit",
  "Quotation Preparation",
  "Feedback Collection",
  "Other"
];

// KIT-specific task types
export const KIT_TASK_TYPES = [
  "KIT Follow-up",
  "KIT Relationship Check",
  "KIT Touch Reminder"
];

// All task types combined for forms
export const ALL_TASK_TYPES = [...TASK_TYPES, ...KIT_TASK_TYPES];

export const TASK_PRIORITIES = [
  { value: "High", label: "High", color: "text-red-600" },
  { value: "Medium", label: "Medium", color: "text-yellow-600" },
  { value: "Low", label: "Low", color: "text-green-600" }
];

export const TASK_STATUSES = [
  "Pending",
  "In Progress", 
  "Completed",
  "Overdue"
];

export const TEAM_MEMBERS = [
  "Vijay Kumar", 
  "Ankit Singh", 
  "Sanjay Patel", 
  "Meera Sharma"
];

export const REMINDER_OPTIONS = [
  { value: "15", label: "15 minutes before" },
  { value: "30", label: "30 minutes before" },
  { value: "60", label: "1 hour before" },
  { value: "1440", label: "1 day before" }
];

export const RECURRENCE_FREQUENCIES = [
  { value: "one-time", label: "One-time (No Recurrence)" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
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

export const RECURRENCE_END_TYPES = [
  { value: "never", label: "Never (continue indefinitely)" },
  { value: "after_occurrences", label: "After X occurrences" },
  { value: "on_date", label: "On specific date" },
];

export const SNOOZE_PRESETS = [
  { value: "later_today", label: "Later Today (+4 hours)", hours: 4 },
  { value: "tomorrow", label: "Tomorrow (same time)", hours: 24 },
  { value: "next_week", label: "Next Week (same day/time)", hours: 168 },
  { value: "15_min", label: "15 minutes", hours: 0.25 },
  { value: "30_min", label: "30 minutes", hours: 0.5 },
  { value: "1_hour", label: "1 hour", hours: 1 },
  { value: "2_hours", label: "2 hours", hours: 2 },
];

export const ENTITY_TYPES = [
  { value: "lead", label: "Lead", icon: "User" },
  { value: "professional", label: "Professional", icon: "Briefcase" },
  { value: "customer", label: "Customer", icon: "Users" },
];

export const TASK_TEMPLATES = [
  {
    name: "Weekly Follow-up Call",
    title: "Weekly follow-up call",
    type: "Follow-up Call",
    description: "Regular weekly check-in to discuss project progress and next steps",
    isRecurring: true,
    recurrenceFrequency: "weekly",
  },
  {
    name: "Quote Follow-up",
    title: "Follow-up on quotation",
    type: "Follow-up Call", 
    description: "Follow up on sent quotation and answer any questions",
    isRecurring: false,
  },
  {
    name: "Sample Collection",
    title: "Collect marble samples",
    type: "Sample Delivery",
    description: "Collect and deliver marble samples for client review",
    isRecurring: false,
  },
  {
    name: "Site Measurement",
    title: "Site measurement visit",
    type: "Site Visit",
    description: "Visit site to take accurate measurements for quotation",
    isRecurring: false,
  },
  {
    name: "Monthly Review",
    title: "Monthly project review",
    type: "Follow-up Meeting",
    description: "Monthly meeting to review project status and upcoming milestones",
    isRecurring: true,
    recurrenceFrequency: "monthly",
  },
];

export const MONTHLY_PATTERNS = [
  { value: "day_of_month", label: "Day X of every month" },
  { value: "week_of_month", label: "Specific weekday of month" },
];

export const WEEK_POSITIONS = [
  { value: "first", label: "First" },
  { value: "second", label: "Second" },
  { value: "third", label: "Third" },
  { value: "fourth", label: "Fourth" },
  { value: "last", label: "Last" },
];
