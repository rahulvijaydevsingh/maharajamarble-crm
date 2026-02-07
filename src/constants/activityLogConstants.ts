import {
  UserPlus, 
  Edit, 
  Activity, 
  CheckSquare, 
  FileText, 
  Mail, 
  Phone, 
  User,
  Calendar,
  MessageSquare,
  Paperclip,
  Bell,
  Download,
  Eye,
  Trash2,
  RefreshCw,
  Zap,
  Building2,
  MapPin,
  AlertTriangle,
  ArrowRightLeft,
  PlusCircle,
  Clock,
  Send,
  Check,
  X,
  RotateCcw,
  Users,
  HeartHandshake,
  SkipForward,
  CalendarDays,
  UserCheck,
  Pause,
  Play,
  XCircle,
  LucideIcon
} from 'lucide-react';

// Activity Types
export type ActivityType = 
  | 'lead_created'
  | 'lead_updated'
  | 'lead_viewed'
  | 'lead_exported'
  | 'lead_converted'
  | 'lead_reassigned'
  | 'status_change'
  | 'priority_change'
  | 'field_update'
  | 'task_created'
  | 'task_updated'
  | 'task_completed'
  | 'task_deleted'
  | 'task_reassigned'
  | 'task_snoozed'
  | 'quotation_created'
  | 'quotation_updated'
  | 'quotation_sent'
  | 'quotation_accepted'
  | 'quotation_rejected'
  | 'quotation_deleted'
  | 'phone_call'
  | 'map_open'
  | 'email_sent'
  | 'meeting'
  | 'site_visit'
  | 'showroom_visit'
  | 'custom_note'
  | 'note_added'
  | 'note_edited'
  | 'note_deleted'
  | 'attachment_added'
  | 'attachment_removed'
  | 'reminder_created'
  | 'reminder_updated'
  | 'reminder_triggered'
  | 'reminder_dismissed'
  | 'reminder_snoozed'
  | 'reminder_deleted'
  | 'followup_scheduled'
  | 'followup_completed'
  | 'followup_missed'
  | 'followup_rescheduled'
  | 'automation_triggered'
  | 'bulk_import'
  | 'customer_created'
  | 'repeat_lead_created'
  | 'kit_activated'
  | 'kit_touch_completed'
  | 'kit_touch_skipped'
  | 'kit_touch_snoozed'
  | 'kit_touch_rescheduled'
  | 'kit_touch_reassigned'
  | 'kit_cycle_completed'
  | 'kit_paused'
  | 'kit_resumed'
  | 'kit_cancelled';

// Activity Categories
export type ActivityCategory = 
  | 'system'
  | 'manual'
  | 'task'
  | 'quotation'
  | 'communication'
  | 'note'
  | 'reminder'
  | 'attachment'
  | 'automation'
  | 'follow_up'
  | 'assignment'
  | 'status_change'
  | 'field_update'
  | 'conversion'
  | 'keep_in_touch';

// Manual Entry Activity Types
export const MANUAL_ACTIVITY_TYPES = [
  { value: 'phone_call', label: 'Phone Call', icon: Phone },
  { value: 'meeting', label: 'Meeting', icon: Users },
  { value: 'site_visit', label: 'Site Visit', icon: MapPin },
  { value: 'email_sent', label: 'Email Sent', icon: Mail },
  { value: 'custom_note', label: 'Custom Note', icon: MessageSquare },
  { value: 'showroom_visit', label: 'Showroom Visit', icon: Building2 },
] as const;

// Activity Icon Configuration
export const ACTIVITY_ICONS: Record<string, LucideIcon> = {
  // Lead activities
  lead_created: UserPlus,
  lead_updated: Edit,
  lead_viewed: Eye,
  lead_exported: Download,
  lead_converted: ArrowRightLeft,
  lead_reassigned: Users,
  status_change: RefreshCw,
  priority_change: Activity,
  field_update: Edit,
  
  // Task activities
  task_created: PlusCircle,
  task_updated: RefreshCw,
  task_completed: CheckSquare,
  task_deleted: Trash2,
  task_reassigned: Users,
  
  // Quotation activities
  quotation_created: FileText,
  quotation_updated: Edit,
  quotation_sent: Send,
  quotation_accepted: Check,
  quotation_rejected: X,
  quotation_deleted: Trash2,
  
  // Communication activities
  phone_call: Phone,
  map_open: MapPin,
  email_sent: Mail,
  meeting: Users,
  site_visit: MapPin,
  showroom_visit: Building2,
  custom_note: MessageSquare,
  
  // Note activities
  note_added: MessageSquare,
  note_edited: Edit,
  note_deleted: Trash2,
  
  // Attachment activities
  attachment_added: Paperclip,
  attachment_removed: Trash2,
  
  // Reminder activities
  reminder_created: Clock,
  reminder_updated: Edit,
  reminder_triggered: Bell,
  reminder_dismissed: X,
  reminder_snoozed: Clock,
  reminder_deleted: Trash2,
  
  // Follow-up activities
  followup_scheduled: Calendar,
  followup_completed: Check,
  followup_missed: AlertTriangle,
  followup_rescheduled: RotateCcw,
  
  // Automation activities
  automation_triggered: Zap,
  
  // Import activities
  bulk_import: Download,
  
  // Conversion activities
  customer_created: UserPlus,
  repeat_lead_created: RotateCcw,
  
  // Keep in Touch activities
  kit_activated: HeartHandshake,
  kit_touch_completed: Check,
  kit_touch_skipped: SkipForward,
  kit_touch_snoozed: Clock,
  kit_touch_rescheduled: CalendarDays,
  kit_touch_reassigned: UserCheck,
  kit_cycle_completed: RefreshCw,
  kit_paused: Pause,
  kit_resumed: Play,
  kit_cancelled: XCircle,
};

// Activity Color Configuration
// Activity Color Configuration
// NOTE: Use semantic tokens only (no hardcoded Tailwind color palettes).
// These are used for icon chips in the Activity Log timeline UI.
export const ACTIVITY_COLORS: Record<string, { bg: string; text: string; border?: string }> = {
  // Primary-ish
  lead_created: { bg: 'bg-primary/10', text: 'text-primary' },
  lead_updated: { bg: 'bg-primary/10', text: 'text-primary' },
  lead_viewed: { bg: 'bg-muted', text: 'text-muted-foreground' },
  lead_exported: { bg: 'bg-muted', text: 'text-muted-foreground' },
  lead_converted: { bg: 'bg-primary/10', text: 'text-primary' },
  lead_reassigned: { bg: 'bg-primary/10', text: 'text-primary' },
  status_change: { bg: 'bg-primary/10', text: 'text-primary' },
  priority_change: { bg: 'bg-primary/10', text: 'text-primary' },
  field_update: { bg: 'bg-primary/10', text: 'text-primary' },

  // Tasks
  task_created: { bg: 'bg-secondary', text: 'text-secondary-foreground' },
  task_updated: { bg: 'bg-secondary', text: 'text-secondary-foreground' },
  task_completed: { bg: 'bg-secondary', text: 'text-secondary-foreground' },
  task_deleted: { bg: 'bg-destructive/10', text: 'text-destructive' },
  task_reassigned: { bg: 'bg-secondary', text: 'text-secondary-foreground' },

  // Quotations
  quotation_created: { bg: 'bg-accent', text: 'text-accent-foreground' },
  quotation_updated: { bg: 'bg-accent', text: 'text-accent-foreground' },
  quotation_sent: { bg: 'bg-accent', text: 'text-accent-foreground' },
  quotation_accepted: { bg: 'bg-primary/10', text: 'text-primary' },
  quotation_rejected: { bg: 'bg-destructive/10', text: 'text-destructive' },
  quotation_deleted: { bg: 'bg-destructive/10', text: 'text-destructive' },

  // Communication
  phone_call: { bg: 'bg-accent', text: 'text-accent-foreground' },
  map_open: { bg: 'bg-accent', text: 'text-accent-foreground' },
  email_sent: { bg: 'bg-accent', text: 'text-accent-foreground' },
  meeting: { bg: 'bg-accent', text: 'text-accent-foreground' },
  site_visit: { bg: 'bg-accent', text: 'text-accent-foreground' },
  showroom_visit: { bg: 'bg-accent', text: 'text-accent-foreground' },
  custom_note: { bg: 'bg-accent', text: 'text-accent-foreground' },

  // Notes
  note_added: { bg: 'bg-muted', text: 'text-foreground' },
  note_edited: { bg: 'bg-muted', text: 'text-foreground' },
  note_deleted: { bg: 'bg-destructive/10', text: 'text-destructive' },

  // Attachments
  attachment_added: { bg: 'bg-muted', text: 'text-foreground' },
  attachment_removed: { bg: 'bg-destructive/10', text: 'text-destructive' },

  // Reminders
  reminder_created: { bg: 'bg-muted', text: 'text-foreground' },
  reminder_updated: { bg: 'bg-muted', text: 'text-foreground' },
  reminder_triggered: { bg: 'bg-muted', text: 'text-foreground' },
  reminder_dismissed: { bg: 'bg-muted', text: 'text-muted-foreground' },
  reminder_snoozed: { bg: 'bg-muted', text: 'text-foreground' },
  reminder_deleted: { bg: 'bg-destructive/10', text: 'text-destructive' },

  // Follow-ups
  followup_scheduled: { bg: 'bg-secondary', text: 'text-secondary-foreground' },
  followup_completed: { bg: 'bg-secondary', text: 'text-secondary-foreground' },
  followup_missed: { bg: 'bg-destructive/10', text: 'text-destructive' },
  followup_rescheduled: { bg: 'bg-secondary', text: 'text-secondary-foreground' },

  // Automation
  automation_triggered: { bg: 'bg-accent', text: 'text-accent-foreground' },

  // Import
  bulk_import: { bg: 'bg-muted', text: 'text-foreground' },

  // Conversion
  customer_created: { bg: 'bg-primary/10', text: 'text-primary' },
  repeat_lead_created: { bg: 'bg-primary/10', text: 'text-primary' },
  
  // Keep in Touch
  kit_activated: { bg: 'bg-violet-500/10', text: 'text-violet-600' },
  kit_touch_completed: { bg: 'bg-violet-500/10', text: 'text-violet-600' },
  kit_touch_skipped: { bg: 'bg-muted', text: 'text-muted-foreground' },
  kit_touch_snoozed: { bg: 'bg-violet-500/10', text: 'text-violet-600' },
  kit_touch_rescheduled: { bg: 'bg-violet-500/10', text: 'text-violet-600' },
  kit_touch_reassigned: { bg: 'bg-violet-500/10', text: 'text-violet-600' },
  kit_cycle_completed: { bg: 'bg-violet-500/10', text: 'text-violet-600' },
  kit_paused: { bg: 'bg-muted', text: 'text-muted-foreground' },
  kit_resumed: { bg: 'bg-violet-500/10', text: 'text-violet-600' },
  kit_cancelled: { bg: 'bg-destructive/10', text: 'text-destructive' },
};

// Get activity icon
export function getActivityIcon(type: string): LucideIcon {
  return ACTIVITY_ICONS[type] || Activity;
}

// Get activity colors
export function getActivityColors(type: string): { bg: string; text: string } {
  return ACTIVITY_COLORS[type] || { bg: 'bg-muted', text: 'text-muted-foreground' };
}

// Activity Type Labels
export const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  lead_created: 'Lead Created',
  lead_updated: 'Lead Updated',
  lead_viewed: 'Lead Viewed',
  lead_exported: 'Data Exported',
  lead_converted: 'Lead Converted to Customer',
  lead_reassigned: 'Lead Reassigned',
  status_change: 'Status Updated',
  priority_change: 'Priority Changed',
  field_update: 'Field Updated',
  task_created: 'Task Created',
  task_updated: 'Task Updated',
  task_completed: 'Task Completed',
  task_deleted: 'Task Deleted',
  task_reassigned: 'Task Reassigned',
  task_snoozed: 'Task Snoozed',
  quotation_created: 'Quotation Created',
  quotation_updated: 'Quotation Updated',
  quotation_sent: 'Quotation Sent',
  quotation_accepted: 'Quotation Accepted',
  quotation_rejected: 'Quotation Rejected',
  quotation_deleted: 'Quotation Deleted',
  phone_call: 'Phone Call',
  map_open: 'Map Opened',
  email_sent: 'Email Sent',
  meeting: 'Meeting',
  site_visit: 'Site Visit',
  showroom_visit: 'Showroom Visit',
  custom_note: 'Custom Note',
  note_added: 'Note Added',
  note_edited: 'Note Edited',
  note_deleted: 'Note Deleted',
  attachment_added: 'Attachment Added',
  attachment_removed: 'Attachment Removed',
  reminder_created: 'Reminder Created',
  reminder_updated: 'Reminder Updated',
  reminder_triggered: 'Reminder Triggered',
  reminder_dismissed: 'Reminder Dismissed',
  reminder_snoozed: 'Reminder Snoozed',
  reminder_deleted: 'Reminder Deleted',
  followup_scheduled: 'Follow-up Scheduled',
  followup_completed: 'Follow-up Completed',
  followup_missed: 'Follow-up Missed',
  followup_rescheduled: 'Follow-up Rescheduled',
  automation_triggered: 'Automation Triggered',
  bulk_import: 'Bulk Import',
  customer_created: 'Customer Created',
  repeat_lead_created: 'Repeat Lead Created',
  // Keep in Touch
  kit_activated: 'KIT Activated',
  kit_touch_completed: 'Touch Completed',
  kit_touch_skipped: 'Touch Skipped',
  kit_touch_snoozed: 'Touch Snoozed',
  kit_touch_rescheduled: 'Touch Rescheduled',
  kit_touch_reassigned: 'Touch Reassigned',
  kit_cycle_completed: 'Cycle Completed',
  kit_paused: 'KIT Paused',
  kit_resumed: 'KIT Resumed',
  kit_cancelled: 'KIT Cancelled',
};

// Filter categories for activity log
export const ACTIVITY_FILTER_CATEGORIES = [
  { value: 'field_update', label: 'Field Updates' },
  { value: 'task', label: 'Tasks' },
  { value: 'quotation', label: 'Quotations' },
  { value: 'communication', label: 'Communication' },
  { value: 'note', label: 'Notes' },
  { value: 'reminder', label: 'Reminders' },
  { value: 'attachment', label: 'Attachments' },
  { value: 'status_change', label: 'Status Changes' },
  { value: 'automation', label: 'Automation Triggers' },
  { value: 'manual', label: 'Manual Entries' },
  { value: 'keep_in_touch', label: 'Keep in Touch' },
] as const;

// Date grouping options
export const DATE_GROUPING_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'this_week', label: 'This Week' },
] as const;
