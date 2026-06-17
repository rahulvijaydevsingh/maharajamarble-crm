 import { Phone, MessageCircle, MapPin, Mail, Users, LucideIcon } from 'lucide-react';
 
 // Touch method configuration
 export type KitTouchMethod = 'call' | 'whatsapp' | 'visit' | 'email' | 'meeting';
 
 export const KIT_TOUCH_METHOD_ICONS: Record<KitTouchMethod, LucideIcon> = {
   call: Phone,
   whatsapp: MessageCircle,
   visit: MapPin,
   email: Mail,
   meeting: Users,
 };
 
export const KIT_TOUCH_METHOD_COLORS: Record<KitTouchMethod, string> = {
  call: 'bg-blue-500/10 text-blue-600',
  whatsapp: 'bg-green-500/10 text-green-600',
  visit: 'bg-orange-500/10 text-orange-600',
  email: 'bg-purple-500/10 text-purple-600',
  meeting: 'bg-pink-500/10 text-pink-600',
};

// Touch methods array for dropdowns
export const KIT_TOUCH_METHODS: { value: KitTouchMethod; label: string }[] = [
  { value: 'call', label: 'Phone Call' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'visit', label: 'Site Visit' },
  { value: 'email', label: 'Email' },
  { value: 'meeting', label: 'Meeting' },
];
 
 // Subscription statuses
 export type KitSubscriptionStatus = 'active' | 'paused' | 'completed' | 'cancelled';
 
 export const KIT_SUBSCRIPTION_STATUS_LABELS: Record<KitSubscriptionStatus, string> = {
   active: 'Active',
   paused: 'Paused',
   completed: 'Completed',
   cancelled: 'Cancelled',
 };
 
 export const KIT_SUBSCRIPTION_STATUS_COLORS: Record<KitSubscriptionStatus, string> = {
   active: 'bg-primary/10 text-primary',
   paused: 'bg-muted text-muted-foreground',
   completed: 'bg-secondary text-secondary-foreground',
   cancelled: 'bg-destructive/10 text-destructive',
 };
 
 // Touch statuses
 export type KitTouchStatus = 'pending' | 'completed' | 'missed' | 'snoozed' | 'skipped';
 
 export const KIT_TOUCH_STATUS_LABELS: Record<KitTouchStatus, string> = {
   pending: 'Pending',
   completed: 'Completed',
   missed: 'Missed',
   snoozed: 'Snoozed',
   skipped: 'Skipped',
 };
 
 export const KIT_TOUCH_STATUS_COLORS: Record<KitTouchStatus, string> = {
   pending: 'bg-muted text-foreground',
   completed: 'bg-primary/10 text-primary',
   missed: 'bg-destructive/10 text-destructive',
   snoozed: 'bg-accent text-accent-foreground',
   skipped: 'bg-muted text-muted-foreground',
 };
 
 // Cycle behavior types
 export type KitCycleBehavior = 'one_time' | 'auto_repeat' | 'user_defined';
 
 export const KIT_CYCLE_BEHAVIOR_LABELS: Record<KitCycleBehavior, string> = {
   one_time: 'One Time Only',
   auto_repeat: 'Auto Repeat Forever',
   user_defined: 'Ask on Completion',
 };
 
 // Entity types
 export type KitEntityType = 'lead' | 'customer' | 'professional';
 
 export const KIT_ENTITY_TYPE_LABELS: Record<KitEntityType, string> = {
   lead: 'Lead',
   customer: 'Customer',
   professional: 'Professional',
 };
 
 // Touch sequence item interface
 export interface KitTouchSequenceItem {
   method: KitTouchMethod;
   interval_days: number;
   assigned_to_type: 'entity_owner' | 'specific_user' | 'field_staff';
   notes?: string;
 }
 
 // Preset interface
 export interface KitPreset {
   id: string;
   name: string;
   description: string | null;
   touch_sequence: KitTouchSequenceItem[];
   default_cycle_behavior: KitCycleBehavior;
   is_active: boolean;
   created_by: string;
   created_at: string;
   updated_at: string;
 }
 
 // Subscription interface
export interface KitSubscription {
    id: string;
    entity_type: KitEntityType;
    entity_id: string;
    preset_id: string | null;
    status: KitSubscriptionStatus;
    assigned_to: string;
    cycle_count: number;
    max_cycles: number | null;
    current_step: number;
    pause_until: string | null;
    pause_reason: string | null;
    started_at: string;
    completed_at: string | null;
    created_by: string;
    created_at: string;
    updated_at: string;
    skip_weekends?: boolean;
    custom_touch_sequence?: KitTouchSequenceItem[] | null;
    preset?: KitPreset;
  }
 
 // Touch interface
  export interface KitTouch {
    id: string;
    subscription_id: string;
    sequence_index: number;
    method: KitTouchMethod;
    scheduled_date: string;
    scheduled_time: string | null;
    assigned_to: string;
    status: KitTouchStatus;
    outcome: string | null;
    outcome_notes: string | null;
    completed_at: string | null;
    snoozed_until: string | null;
    reschedule_count: number;
    original_scheduled_date: string | null;
    linked_task_id: string | null;
    linked_reminder_id: string | null;
    created_at: string;
    updated_at: string;
    subscription?: KitSubscription;
  }
 
 // Outcome interface
 export interface KitOutcome {
   id: string;
   value: string;
   label: string;
   requires_followup: boolean;
   is_positive: boolean;
   display_order: number;
 }
 
 // Touch method interface
 export interface KitTouchMethodConfig {
   id: string;
   value: KitTouchMethod;
   label: string;
   icon: string | null;
   is_active: boolean;
   display_order: number;
 }