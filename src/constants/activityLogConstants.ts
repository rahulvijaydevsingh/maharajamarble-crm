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
  | 'repeat_lead_created';

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
  | 'conversion';

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
};

// Activity Color Configuration
export const ACTIVITY_COLORS: Record<string, { bg: string; text: string; border?: string }> = {
  // System activities (Blue)
  lead_created: { bg: 'bg-green-100', text: 'text-green-600' },
  lead_updated: { bg: 'bg-indigo-100', text: 'text-indigo-600' },
  lead_viewed: { bg: 'bg-gray-100', text: 'text-gray-600' },
  lead_exported: { bg: 'bg-gray-100', text: 'text-gray-600' },
  lead_converted: { bg: 'bg-emerald-100', text: 'text-emerald-600' },
  lead_reassigned: { bg: 'bg-cyan-100', text: 'text-cyan-600' },
  status_change: { bg: 'bg-blue-100', text: 'text-blue-600' },
  priority_change: { bg: 'bg-indigo-100', text: 'text-indigo-600' },
  field_update: { bg: 'bg-indigo-100', text: 'text-indigo-600' },
  
  // Task activities (Green)
  task_created: { bg: 'bg-green-100', text: 'text-green-600' },
  task_updated: { bg: 'bg-amber-100', text: 'text-amber-600' },
  task_completed: { bg: 'bg-green-100', text: 'text-green-600' },
  task_deleted: { bg: 'bg-red-100', text: 'text-red-600' },
  task_reassigned: { bg: 'bg-cyan-100', text: 'text-cyan-600' },
  
  // Quotation activities (Teal)
  quotation_created: { bg: 'bg-teal-100', text: 'text-teal-600' },
  quotation_updated: { bg: 'bg-teal-100', text: 'text-teal-600' },
  quotation_sent: { bg: 'bg-teal-100', text: 'text-teal-600' },
  quotation_accepted: { bg: 'bg-green-100', text: 'text-green-600' },
  quotation_rejected: { bg: 'bg-red-100', text: 'text-red-600' },
  quotation_deleted: { bg: 'bg-red-100', text: 'text-red-600' },
  
  // Communication activities (Orange)
  phone_call: { bg: 'bg-orange-100', text: 'text-orange-600' },
  email_sent: { bg: 'bg-orange-100', text: 'text-orange-600' },
  meeting: { bg: 'bg-orange-100', text: 'text-orange-600' },
  site_visit: { bg: 'bg-orange-100', text: 'text-orange-600' },
  showroom_visit: { bg: 'bg-orange-100', text: 'text-orange-600' },
  custom_note: { bg: 'bg-orange-100', text: 'text-orange-600' },
  
  // Note activities (Yellow)
  note_added: { bg: 'bg-yellow-100', text: 'text-yellow-600' },
  note_edited: { bg: 'bg-yellow-100', text: 'text-yellow-600' },
  note_deleted: { bg: 'bg-red-100', text: 'text-red-600' },
  
  // Attachment activities (Purple)
  attachment_added: { bg: 'bg-purple-100', text: 'text-purple-600' },
  attachment_removed: { bg: 'bg-red-100', text: 'text-red-600' },
  
  // Reminder activities (Pink)
  reminder_created: { bg: 'bg-pink-100', text: 'text-pink-600' },
  reminder_updated: { bg: 'bg-pink-100', text: 'text-pink-600' },
  reminder_triggered: { bg: 'bg-pink-100', text: 'text-pink-600' },
  reminder_dismissed: { bg: 'bg-gray-100', text: 'text-gray-600' },
  reminder_snoozed: { bg: 'bg-pink-100', text: 'text-pink-600' },
  reminder_deleted: { bg: 'bg-red-100', text: 'text-red-600' },
  
  // Follow-up activities (Lime)
  followup_scheduled: { bg: 'bg-lime-100', text: 'text-lime-600' },
  followup_completed: { bg: 'bg-green-100', text: 'text-green-600' },
  followup_missed: { bg: 'bg-red-100', text: 'text-red-600' },
  followup_rescheduled: { bg: 'bg-lime-100', text: 'text-lime-600' },
  
  // Automation activities (Purple)
  automation_triggered: { bg: 'bg-violet-100', text: 'text-violet-600' },
  
  // Import activities (Emerald)
  bulk_import: { bg: 'bg-emerald-100', text: 'text-emerald-600' },
  
  // Conversion activities
  customer_created: { bg: 'bg-emerald-100', text: 'text-emerald-600' },
  repeat_lead_created: { bg: 'bg-blue-100', text: 'text-blue-600' },
};

// Get activity icon
export function getActivityIcon(type: string): LucideIcon {
  return ACTIVITY_ICONS[type] || Activity;
}

// Get activity colors
export function getActivityColors(type: string): { bg: string; text: string } {
  return ACTIVITY_COLORS[type] || { bg: 'bg-gray-100', text: 'text-gray-600' };
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
] as const;

// Date grouping options
export const DATE_GROUPING_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'this_week', label: 'This Week' },
] as const;
