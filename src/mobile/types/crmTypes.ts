/**
 * Mobile workspace view models.
 *
 * These types describe the shape the `/m` screens render. They are produced
 * from the live Supabase-backed entities by `src/mobile/lib/mappers.ts`, so a
 * screen never touches a raw database row directly.
 */

export type EntityKind = 'lead' | 'customer' | 'professional';
export type WorkspacePref = 'mobile' | 'desktop';

export type MainTab = 'today' | 'work' | 'people' | 'more';

export type WorkFilter = 'today' | 'overdue' | 'upcoming' | 'completed' | 'cancelled';

export type PeopleFilter = 'recent' | 'leads' | 'customers' | 'professionals';

export type EntityProfileTab = 'overview' | 'tasks' | 'notes' | 'files';

/**
 * A professional captured on `leads.referred_by` (JSONB).
 *
 * The desktop CRM stores a structured object here, not a plain string, so the
 * mobile workspace must be able to round-trip it without flattening it.
 */
export interface ProfessionalRef {
  id: string;
  name: string;
  firmName?: string | null;
  type?: string | null;
  phone?: string | null;
  email?: string | null;
}

/**
 * A secondary contact stored on `leads.additional_contacts` / `customers.additional_contacts`
 * (a JSONB array on the live table). `professional_id` / `is_primary_contact` are
 * optional so the JSONB shape stays backwards compatible with the desktop writer.
 */
export interface AdditionalContact {
  id: string;
  name: string;
  phone: string;
  relation?: string;
  email?: string;
  designation?: string;
  alternate_phone?: string;
  firm_name?: string;
  professional_id?: string | null;
  is_primary_contact?: boolean;
  is_professional?: boolean;
  /**
   * Non-rendered passthrough for the desktop-only JSONB keys of this contact.
   *
   * The desktop writes fields the mobile screens never display. Keeping them
   * here means editing a lead on mobile does not silently drop them.
   */
  raw?: Record<string, unknown>;
}

export interface LeadAttachment {
  id: string;
  name: string;
  type: 'image' | 'pdf';
  sizeLabel: string;
  url?: string | null;
  uploadedAt: string;
  uploadedBy: string;
  /**
   * The compressed file that is still on the device.
   *
   * It is uploaded to the attachment storage once the lead is saved — the
   * `url` above is only a local `blob:` preview and must never be persisted.
   */
  localFile?: File;
  exifGps?: {
    lat: number;
    lng: number;
    plusCode: string;
  };
}

/** Lead view model. `lead_source` / `plus_code` / `next_action_at` mirror the
 *  live columns `source` / `site_plus_code` / `next_follow_up`. */
export interface Lead {
  id: string;
  full_name: string;
  phone: string;
  alternate_phone?: string | null;
  email?: string | null;
  designation: string;
  firm_name?: string | null;
  /** Derived: resolved from the live professionals list, never persisted here. */
  professional_id?: string | null;
  site_location: string;
  address?: string | null;
  plus_code?: string | null;
  site_lat?: number | null;
  site_lng?: number | null;
  material_interests: string[];
  construction_stage: string;
  estimated_qty_sqft?: number | null;
  lead_source: string;
  /** Desktop stores a `ProfessionalRef` JSONB object here; legacy rows are plain strings. */
  referred_by?: string | ProfessionalRef | null;
  /** Control Panel `leads.priority` value space ("1".."5"), stored as a number. */
  priority: number;
  /** Control Panel `leads.status` value space ("new" | "in-progress" | ...). */
  status: string;
  /**
   * The conversion columns.
   *
   * The desktop converts a lead by writing `status: 'won'` plus
   * `is_converted` / `converted_to_customer_id` — the status alone never says
   * that a lead became a customer.
   */
  is_converted?: boolean | null;
  converted_to_customer_id?: string | null;
  lost_reason?: string | null;
  next_action_at: string;
  reminder_enabled: boolean;
  assigned_to: string;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
  notes?: string | null;
  site_photo_url?: string | null;
  additional_contacts: AdditionalContact[];
  attachments: LeadAttachment[];
  is_deleted?: boolean;
}

export interface Customer {
  id: string;
  full_name: string;
  phone: string;
  alternate_phone?: string | null;
  email?: string | null;
  firm_name?: string | null;
  address: string;
  city?: string | null;
  customer_status: string;
  plus_code?: string | null;
  material_interests: string[];
  source_lead_id?: string | null;
  assigned_to: string;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
  notes?: string | null;
  additional_contacts: AdditionalContact[];
  attachments: LeadAttachment[];
}

/** Professional view model. */
export interface Professional {
  id: string;
  full_name: string;
  phone: string;
  alternate_phone?: string | null;
  email?: string | null;
  professional_type: string;
  firm_name: string;
  office_location: string;
  city?: string | null;
  plus_code?: string | null;
  preferred_materials: string[];
  professional_status: string;
  assigned_to: string;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
  notes?: string | null;
}

/**
 * Task view model. `task_type` mirrors the live `tasks.type` column, which
 * lives in the Control Panel Title Case value space ("Follow-up Call").
 * `due_at` is the combination of the live `due_date` + `due_time` columns.
 */
export interface CrmTask {
  id: string;
  title: string;
  description?: string | null;
  task_type: string;
  due_at: string;
  status: string;
  is_recurring: boolean;
  recurrence_rule?: string | null;
  reminder_enabled: boolean;
  lead_id: string | null;
  customer_id: string | null;
  professional_id: string | null;
  related_entity_type?: string | null;
  related_entity_id?: string | null;
  lead?: {
    id: string;
    full_name: string;
    phone: string;
    site_location?: string | null;
    designation?: string | null;
    status?: string | null;
  } | null;
  customer?: {
    id: string;
    full_name: string;
    phone: string;
    address?: string | null;
  } | null;
  professional?: {
    id: string;
    full_name: string;
    phone: string;
    office_location?: string | null;
    professional_type?: string | null;
  } | null;
  assigned_to: string;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
  completion_outcome?: string | null;
  completion_notes?: string | null;
  is_deleted?: boolean;
}

/**
 * Call outcome. The value space is the live `tasks.completion_outcome` column,
 * driven by the Control Panel field `tasks.completion_outcome` and falling back
 * to `TASK_COMPLETION_OUTCOMES` from `src/constants/taskConstants.ts`.
 */
export type CallOutcomeValue = string;

export type CallOutcomeAction = 'keep_open' | 'reschedule' | 'complete' | 'cancel';

export interface PendingCallState {
  entityType: EntityKind;
  entityId: string;
  entityName: string;
  phone: string;
  taskId?: string | null;
  startedAt: number;
}

export type OutboxMutationKind =
  | 'create_lead'
  | 'update_lead'
  | 'create_task'
  | 'task_action'
  | 'log_call'
  | 'add_note'
  | 'add_reminder'
  | 'snooze_reminder'
  | 'done_reminder';

export type OutboxMutationStatus = 'queued' | 'syncing' | 'needs_review';

export interface OutboxMutation {
  id: string;
  /** Idempotency key: a replayed mutation with the same id is never applied twice. */
  client_mutation_id: string;
  kind: OutboxMutationKind;
  label: string;
  payload: Record<string, unknown>;
  createdAt: string;
  status: OutboxMutationStatus;
  attempts: number;
  conflictMessage?: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  time_label: string;
  category: 'reminder' | 'task' | 'system' | 'message';
  read: boolean;
  target_route?: MobileRoute;
}

export type MobileRoute =
  | { name: 'today' }
  | { name: 'work'; initialFilter?: WorkFilter; taskId?: string }
  | { name: 'people'; initialFilter?: PeopleFilter }
  | { name: 'more' }
  | { name: 'messages'; threadId?: string | null }
  | { name: 'lead_form'; mode: 'create' | 'edit'; leadId?: string }
  | {
      name: 'entity_profile';
      entityType: EntityKind;
      entityId: string;
      initialTab?: EntityProfileTab;
    }
  | { name: 'customer_edit'; customerId: string }
  | { name: 'professional_edit'; professionalId: string }
  | { name: 'full_crm_handoff'; targetLabel: string; targetCode: string };

export interface CallLogInput {
  entityType: EntityKind;
  entityId: string;
  entityName: string;
  taskId?: string | null;
  outcome: CallOutcomeValue;
  note: string;
  taskAction: CallOutcomeAction;
  rescheduleAt: string;
  reminderEnabled: boolean;
}

export interface LeadFormInput {
  id?: string;
  full_name: string;
  phone: string;
  alternate_phone?: string | null;
  email?: string | null;
  designation: string;
  firm_name?: string | null;
  professional_id?: string | null;
  site_location: string;
  address?: string | null;
  plus_code?: string | null;
  site_lat?: number | null;
  site_lng?: number | null;
  material_interests: string[];
  construction_stage: string;
  estimated_qty_sqft?: number | null;
  lead_source: string;
  /** Desktop stores a `ProfessionalRef` JSONB object here; legacy rows are plain strings. */
  referred_by?: string | ProfessionalRef | null;
  notes?: string | null;
  priority: number;
  next_action_at: string;
  reminder_enabled: boolean;
  additional_contacts?: AdditionalContact[];
  attachments?: LeadAttachment[];
  /**
   * D9: when true, a duplicate-lead match is saved anyway instead of blocking
   * the submit behind the duplicate modal.
   */
  forceSave?: boolean;
}
