/**
 * Translation layer between the live Supabase-backed entities and the mobile
 * view models in `src/mobile/types/crmTypes.ts`.
 *
 * The live tables use different column names than the mobile screens render
 * (for example `leads.name` → `Lead.full_name`, `leads.source` →
 * `Lead.lead_source`, `tasks.type` → `CrmTask.task_type`, `tasks.due_date` +
 * `tasks.due_time` → `CrmTask.due_at`). Keeping the translation in one place
 * means the screens stay readable and no screen has to know the storage shape.
 *
 * Every function here is pure so it can be unit tested in a node environment.
 */

import type { Lead as LiveLead, LeadInsert as LiveLeadInsert } from '@/hooks/useLeads';
import type { Customer as LiveCustomer, CustomerInsert as LiveCustomerInsert } from '@/hooks/useCustomers';
import type {
  Professional as LiveProfessional,
  ProfessionalInsert as LiveProfessionalInsert,
} from '@/hooks/useProfessionals';
import type { Task as LiveTask, TaskInsert as LiveTaskInsert } from '@/hooks/useTasks';
import type { Json } from '@/integrations/supabase/types';
import { normalizePhone10 } from '@/lib/phone';

import type {
  AdditionalContact,
  CrmTask,
  Customer,
  Lead,
  LeadAttachment,
  Professional,
  ProfessionalRef,
} from '@/mobile/types/crmTypes';
import { combineDateAndTime, toLocalTimeInputValue } from '@/mobile/lib/format';

/* -------------------------------------------------------------------------- */
/* JSONB helpers                                                              */
/* -------------------------------------------------------------------------- */

/** Coerces an arbitrary JSONB value into a plain string, or `null`. */
export function jsonToString(value: Json | null | undefined): string | null {
  if (typeof value === 'string') return value.trim() ? value : null;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return null;
}

/**
 * Reads `additional_contacts` (a JSONB array) into typed contacts.
 * Never throws: a malformed or non-array value yields an empty list.
 *
 * Every contact keeps the raw JSONB record in `raw` so desktop-only keys
 * survive a mobile edit — see {@link serializeAdditionalContacts}.
 */
export function parseAdditionalContacts(value: Json | null | undefined): AdditionalContact[] {
  if (!Array.isArray(value)) return [];
  const contacts: AdditionalContact[] = [];
  value.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return;
    const record = entry as Record<string, unknown>;
    const name = typeof record.name === 'string' ? record.name : '';
    const phone = typeof record.phone === 'string' ? record.phone : '';
    contacts.push({
      ...record,
      id: typeof record.id === 'string' && record.id ? record.id : `ac-${index}-${name}-${phone}`,
      name,
      phone,
      relation: typeof record.relation === 'string' ? record.relation : undefined,
      email: typeof record.email === 'string' ? record.email : undefined,
      designation: typeof record.designation === 'string' ? record.designation : undefined,
      alternate_phone:
        typeof record.alternatePhone === 'string'
          ? record.alternatePhone
          : typeof record.alternate_phone === 'string'
            ? record.alternate_phone
            : undefined,
      firm_name:
        typeof record.firm_name === 'string'
          ? record.firm_name
          : typeof record.firmName === 'string'
            ? record.firmName
            : undefined,
      professional_id:
        typeof record.professional_id === 'string' ? record.professional_id : null,
      is_primary_contact:
        typeof record.is_primary_contact === 'boolean' ? record.is_primary_contact : false,
      is_professional:
        typeof record.isProfessional === 'boolean'
          ? record.isProfessional
          : typeof record.is_professional === 'boolean'
            ? record.is_professional
            : undefined,
      raw: { ...record },
    });
  });
  return contacts;
}

/**
 * Serializes contacts back into the JSONB array shape the desktop writes.
 *
 * The unknown desktop-only keys captured in `raw` are written back first, so a
 * round trip through the mobile form never drops a field the desktop owns.
 */
export function serializeAdditionalContacts(
  contacts: AdditionalContact[] | null | undefined,
): Array<Record<string, unknown>> {
  if (!Array.isArray(contacts)) return [];
  return contacts.map((contact) => {
    const record: Record<string, unknown> = {
      ...(contact.raw ?? {}),
      id: contact.id,
      name: contact.name,
      phone: contact.phone,
    };
    if (contact.relation) record.relation = contact.relation;
    if (contact.email) record.email = contact.email;
    if (contact.designation) record.designation = contact.designation;
    if (contact.alternate_phone) record.alternatePhone = contact.alternate_phone;
    if (contact.firm_name) {
      record.firm_name = contact.firm_name;
      record.firmName = contact.firm_name;
    }
    if (contact.professional_id) record.professional_id = contact.professional_id;
    if (contact.is_primary_contact) record.is_primary_contact = true;
    if (contact.is_professional) record.isProfessional = contact.is_professional;
    // The passthrough itself is never part of the stored shape.
    delete record.raw;
    return record;
  });
}

/**
 * Reads `leads.referred_by` (JSONB) into either a plain string (legacy rows)
 * or a {@link ProfessionalRef} object (the desktop shape).
 *
 * The desktop stores a structured object here. Flattening it to a string — or
 * wiping it on edit — loses the referral, so the object is preserved as-is.
 */
export function parseReferredBy(
  value: Json | null | undefined,
): string | ProfessionalRef | null {
  if (typeof value === 'string') return value.trim() ? value : null;
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const id = typeof record.id === 'string' ? record.id : '';
    const name = typeof record.name === 'string' ? record.name : '';
    if (!id && !name) return null;
    return {
      id,
      name,
      firmName:
        typeof record.firmName === 'string'
          ? record.firmName
          : typeof record.firm_name === 'string'
            ? record.firm_name
            : null,
      type: typeof record.type === 'string' ? record.type : null,
      phone: typeof record.phone === 'string' ? record.phone : null,
      email: typeof record.email === 'string' ? record.email : null,
    };
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* Priority helpers                                                           */
/* -------------------------------------------------------------------------- */

/**
 * The Control Panel `leads.priority` field stores values `"1"`..`"5"`, while
 * the live `leads.priority` column is a number. This converts either form.
 */
export function toPriorityNumber(value: number | string | null | undefined): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value.trim(), 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 3;
}

/* -------------------------------------------------------------------------- */
/* Lead                                                                       */
/* -------------------------------------------------------------------------- */

export function toMobileLead(lead: LiveLead): Lead {
  const additionalContacts = parseAdditionalContacts(lead.additional_contacts);
  const nextFollowUp = lead.next_follow_up ?? null;
  const attachments: LeadAttachment[] = [];

  if (lead.site_photo_url) {
    attachments.push({
      id: `${lead.id}-site-photo`,
      name: 'Site photo',
      type: 'image',
      sizeLabel: '—',
      url: lead.site_photo_url,
      uploadedAt: lead.created_at,
      uploadedBy: lead.created_by,
    });
  }

  return {
    id: lead.id,
    full_name: lead.name ?? '',
    phone: lead.phone ?? '',
    alternate_phone: lead.alternate_phone ?? null,
    email: lead.email ?? null,
    designation: lead.designation ?? '',
    firm_name: lead.firm_name ?? null,
    professional_id: null,
    site_location: lead.site_location ?? '',
    address: lead.address ?? null,
    plus_code: lead.site_plus_code ?? null,
    site_lat: null,
    site_lng: null,
    material_interests: Array.isArray(lead.material_interests) ? lead.material_interests : [],
    construction_stage: lead.construction_stage ?? '',
    estimated_qty_sqft: lead.estimated_quantity ?? null,
    lead_source: lead.source ?? '',
    referred_by: parseReferredBy(lead.referred_by),
    priority: toPriorityNumber(lead.priority),
    status: lead.status ?? 'new',
    // The live `Lead` type does not declare the conversion columns even
    // though they exist on the table — they decide whether a lead is a
    // customer already.
    is_converted:
      (lead as unknown as { is_converted?: boolean | null }).is_converted ?? null,
    converted_to_customer_id:
      (lead as unknown as { converted_to_customer_id?: string | null })
        .converted_to_customer_id ?? null,
    lost_reason:
      typeof (lead as unknown as Record<string, unknown>).lost_reason === 'string'
        ? ((lead as unknown as Record<string, unknown>).lost_reason as string)
        : null,
    next_action_at: nextFollowUp ?? '',
    reminder_enabled: Boolean(nextFollowUp),
    assigned_to: lead.assigned_to ?? '',
    created_by: lead.created_by ?? '',
    updated_by: lead.updated_by ?? lead.created_by ?? '',
    created_at: lead.created_at ?? '',
    updated_at: lead.updated_at ?? lead.created_at ?? '',
    notes: lead.notes ?? null,
    site_photo_url: lead.site_photo_url ?? null,
    additional_contacts: additionalContacts,
    attachments,
    is_deleted:
      typeof (lead as unknown as Record<string, unknown>).is_deleted === 'boolean'
        ? ((lead as unknown as Record<string, unknown>).is_deleted as boolean)
        : false,
  };
}

/**
 * The payload the mobile workspace writes to `leads`.
 *
 * `LiveLeadInsert` does not declare `next_follow_up` / `last_follow_up` even
 * though the columns exist on the table (the desktop writes them through a
 * `Partial<Lead>` payload). The extra columns are declared here and the call
 * site casts once when handing the payload to `useLeads()`.
 */
export type MobileLeadWrite = Omit<LiveLeadInsert, 'additional_contacts'> & {
  additional_contacts?: Array<Record<string, unknown>>;
  next_follow_up?: string | null;
  last_follow_up?: string | null;
  status?: string;
};

/**
 * Normalises an alternate phone number.
 *
 * A valid 10-digit Indian mobile is normalised; **anything else is stored
 * exactly as it was typed**. A landline (`011-23456789`) must never be
 * turned into `null` — losing it would silently drop a contact detail.
 */
export function toAlternatePhoneValue(raw?: string | null): string | null {
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  if (!trimmed) return null;
  return normalizePhone10(trimmed) ?? trimmed;
}

/**
 * The lead columns the mobile form writes, in the shape of the live row.
 *
 * `referred_by` must be the **parsed** value (see {@link parseReferredBy}) so
 * an untouched referral is recognised as unchanged.
 */
export interface LeadUpdateOriginal {
  name?: string | null;
  phone?: string | null;
  alternate_phone?: string | null;
  email?: string | null;
  designation?: string | null;
  firm_name?: string | null;
  additional_contacts?: unknown;
  site_location?: string | null;
  site_plus_code?: string | null;
  address?: string | null;
  construction_stage?: string | null;
  estimated_quantity?: number | null;
  material_interests?: string[] | null;
  source?: string | null;
  referred_by?: string | ProfessionalRef | null;
  notes?: string | null;
  assigned_to?: string | null;
  priority?: number | null;
}

/** A JSON value with a stable key order — used for the change detection. */
function stableJson(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`;
}

/**
 * The comparable shape of one additional contact.
 *
 * The generated contact ids are ignored on purpose — they change on every
 * hydration and would make every save look like a change.
 */
function comparableContact(record: Record<string, unknown>): Record<string, unknown> {
  return {
    name: typeof record.name === 'string' ? record.name : '',
    phone: typeof record.phone === 'string' ? record.phone : '',
    email: typeof record.email === 'string' ? record.email : '',
    designation: typeof record.designation === 'string' ? record.designation : '',
    firm_name:
      typeof record.firm_name === 'string'
        ? record.firm_name
        : typeof record.firmName === 'string'
          ? record.firmName
          : '',
    professional_id: typeof record.professional_id === 'string' ? record.professional_id : '',
  };
}

/** The comparable shape of the whole `additional_contacts` array. */
function comparableContacts(value: unknown): string {
  if (!Array.isArray(value)) return '[]';
  return stableJson(value.map((entry) => comparableContact(entry as Record<string, unknown>)));
}

/**
 * Builds the `leads` **update** payload of an Edit save.
 *
 * Only the fields that really changed are written:
 *  - `created_by` is never written (the creator of the lead does not change),
 *  - an untouched `referred_by` JSONB is left alone (it is never rewritten),
 *  - `updated_by` always records the signed-in actor.
 */
export function toLeadUpdate(
  original: LeadUpdateOriginal,
  form: Parameters<typeof toLeadInsert>[0],
  assignedTo: string,
  actorName: string = assignedTo,
): Record<string, unknown> {
  const payload = toLeadInsert(form, assignedTo, actorName) as unknown as Record<
    string,
    unknown
  >;
  const updates: Record<string, unknown> = {};

  Object.keys(payload).forEach((key) => {
    if (key === 'created_by' || key === 'updated_by') return;
    const next = payload[key];
    const before = (original as unknown as Record<string, unknown>)[key];

    if (key === 'additional_contacts') {
      if (comparableContacts(before) !== comparableContacts(next)) {
        updates[key] = next;
      }
      return;
    }

    if (stableJson(before) !== stableJson(next)) {
      updates[key] = next;
    }
  });

  updates.updated_by = actorName;
  return updates;
}

/**
 * Builds the `leads` insert/update payload from a mobile form model.
 *
 * `forceSave` is intentionally NOT part of the payload — it only controls the
 * client-side duplicate gate before this function is called.
 *
 * INVARIANT-04: `assigned_to` records the staff member the record is assigned
 * to, while `created_by` / `updated_by` always record the **signed-in actor**
 * (`profile.full_name`). They are never the same value by accident.
 *
 * The follow-up date is NOT part of the payload: the database trigger
 * `sync_followup_dates_on_task_change` owns `leads.next_follow_up` and
 * derives it from the tasks.
 */
export function toLeadInsert(
  form: {
    full_name: string;
    phone: string;
    alternate_phone?: string | null;
    email?: string | null;
    designation: string;
    firm_name?: string | null;
    site_location: string;
    address?: string | null;
    plus_code?: string | null;
    material_interests: string[];
    construction_stage: string;
    estimated_qty_sqft?: number | null;
    lead_source: string;
    referred_by?: string | ProfessionalRef | null;
    notes?: string | null;
    priority: number;
    next_action_at: string;
    reminder_enabled: boolean;
    additional_contacts?: AdditionalContact[];
  },
  assignedTo: string,
  actorName: string = assignedTo,
): MobileLeadWrite {
  return {
    name: form.full_name.trim(),
    phone: form.phone,
    alternate_phone: toAlternatePhoneValue(form.alternate_phone),
    email: form.email ?? null,
    designation: form.designation,
    firm_name: form.firm_name ?? null,
    additional_contacts: serializeAdditionalContacts(form.additional_contacts),
    site_location: form.site_location ?? null,
    site_plus_code: form.plus_code ?? null,
    address: form.address ?? null,
    construction_stage: form.construction_stage,
    estimated_quantity: form.estimated_qty_sqft ?? null,
    material_interests: Array.isArray(form.material_interests) ? form.material_interests : [],
    source: form.lead_source,
    referred_by: (form.referred_by ?? null) as unknown as Json,
    notes: form.notes ?? null,
    assigned_to: assignedTo,
    priority: toPriorityNumber(form.priority),
    // `next_follow_up` is deliberately NOT written: the database trigger
    // `sync_followup_dates_on_task_change` derives it from the tasks. Writing
    // it here would fight the trigger.
    created_by: actorName,
    updated_by: actorName,
  };
}

/* -------------------------------------------------------------------------- */
/* Customer                                                                   */
/* -------------------------------------------------------------------------- */

export function toMobileCustomer(customer: LiveCustomer): Customer {
  return {
    id: customer.id,
    full_name: customer.name ?? '',
    phone: customer.phone ?? '',
    alternate_phone: customer.alternate_phone ?? null,
    email: customer.email ?? null,
    firm_name: customer.company_name ?? null,
    address: customer.address ?? '',
    city: customer.city ?? null,
    customer_status: customer.status ?? 'active',
    plus_code: customer.site_plus_code ?? null,
    material_interests: Array.isArray(customer.materials_purchased)
      ? customer.materials_purchased
      : [],
    source_lead_id: customer.created_from_lead_id ?? customer.lead_id ?? null,
    assigned_to: customer.assigned_to ?? '',
    created_by: customer.created_by ?? '',
    updated_by: customer.updated_by ?? customer.created_by ?? '',
    created_at: customer.created_at ?? '',
    updated_at: customer.updated_at ?? customer.created_at ?? '',
    notes: customer.notes ?? null,
    additional_contacts: parseAdditionalContacts(customer.additional_contacts),
    attachments: [],
  };
}

export function toCustomerInsert(
  form: {
    full_name: string;
    phone: string;
    alternate_phone?: string | null;
    email?: string | null;
    firm_name?: string | null;
    address: string;
    city?: string | null;
    plus_code?: string | null;
    notes?: string | null;
    additional_contacts?: AdditionalContact[];
  },
  assignedTo: string,
  actorName: string = assignedTo,
): LiveCustomerInsert {
  return {
    name: form.full_name.trim(),
    phone: form.phone,
    alternate_phone: form.alternate_phone ?? null,
    email: form.email ?? null,
    company_name: form.firm_name ?? null,
    address: form.address ?? null,
    city: form.city ?? null,
    site_plus_code: form.plus_code ?? null,
    notes: form.notes ?? null,
    additional_contacts: serializeAdditionalContacts(form.additional_contacts) as unknown as Json,
    assigned_to: assignedTo,
    created_by: actorName,
    updated_by: actorName,
  };
}

/* -------------------------------------------------------------------------- */
/* Professional                                                               */
/* -------------------------------------------------------------------------- */

export function toMobileProfessional(professional: LiveProfessional): Professional {
  return {
    id: professional.id,
    full_name: professional.name ?? '',
    phone: professional.phone ?? '',
    alternate_phone: professional.alternate_phone ?? null,
    email: professional.email ?? null,
    professional_type: professional.professional_type ?? '',
    firm_name: professional.firm_name ?? '',
    office_location: professional.address ?? '',
    city: professional.city ?? null,
    plus_code: professional.site_plus_code ?? null,
    preferred_materials: [],
    professional_status: professional.status ?? 'active',
    assigned_to: professional.assigned_to ?? '',
    created_by: professional.created_by ?? '',
    updated_by: professional.updated_by ?? professional.created_by ?? '',
    created_at: professional.created_at ?? '',
    updated_at: professional.updated_at ?? professional.created_at ?? '',
    notes: professional.notes ?? null,
  };
}

export function toProfessionalInsert(
  form: {
    full_name: string;
    phone: string;
    alternate_phone?: string | null;
    email?: string | null;
    professional_type: string;
    firm_name?: string | null;
    office_location: string;
    city?: string | null;
    plus_code?: string | null;
    notes?: string | null;
  },
  staffName: string,
  actorName: string = staffName,
): LiveProfessionalInsert {
  return {
    name: form.full_name.trim(),
    phone: form.phone,
    alternate_phone: form.alternate_phone ?? null,
    email: form.email ?? null,
    professional_type: form.professional_type,
    firm_name: form.firm_name ?? null,
    address: form.office_location ?? null,
    city: form.city ?? null,
    site_plus_code: form.plus_code ?? null,
    notes: form.notes ?? null,
    assigned_to: staffName,
    created_by: actorName,
    updated_by: actorName,
  };
}

/* -------------------------------------------------------------------------- */
/* Task                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Builds the combined ISO timestamp the mobile UI works with from the live
 * `due_date` (date part) and `due_time` (`HH:MM`) columns.
 */
export function taskDueAt(task: Pick<LiveTask, 'due_date' | 'due_time'>): string {
  const date = task.due_date ?? '';
  if (!date) return '';
  const time = task.due_time ? toLocalTimeInputValue(`${date}T${task.due_time}`) : '23:59';
  return combineDateAndTime(date.slice(0, 10), time);
}

/**
 * Maps a live task into the mobile view model.
 *
 * The live task only ships a joined `lead`. Customer and professional links
 * live in `related_entity_type` / `related_entity_id`, so those are mapped to
 * the dedicated id columns; the screens join the display details from
 * `useCustomers()` / `useProfessionals()`.
 */
export function toMobileTask(task: LiveTask): CrmTask {
  const relatedType = task.related_entity_type ?? null;
  const relatedId = task.related_entity_id ?? null;

  return {
    id: task.id,
    title: task.title ?? '',
    description: task.description ?? null,
    task_type: task.type ?? '',
    due_at: taskDueAt(task),
    status: task.status ?? 'Pending',
    is_recurring: Boolean(task.is_recurring),
    recurrence_rule: task.recurrence_frequency ?? null,
    reminder_enabled: Boolean(task.reminder),
    lead_id: task.lead_id ?? null,
    customer_id: relatedType === 'customer' ? relatedId : null,
    professional_id: relatedType === 'professional' ? relatedId : null,
    related_entity_type: relatedType,
    related_entity_id: relatedId,
    lead: task.lead
      ? {
          id: task.lead.id,
          full_name: task.lead.name ?? '',
          phone: task.lead.phone ?? '',
          site_location: task.lead.site_plus_code ?? null,
          designation: null,
          status: task.lead.status ?? null,
        }
      : null,
    customer: null,
    professional: null,
    assigned_to: task.assigned_to ?? '',
    created_by: task.created_by ?? '',
    updated_by: task.updated_by ?? task.created_by ?? '',
    created_at: task.created_at ?? '',
    updated_at: task.updated_at ?? task.created_at ?? '',
    completion_outcome: task.completion_outcome ?? null,
    completion_notes: task.completion_notes ?? null,
    is_deleted: Boolean(task.is_deleted),
  };
}

/**
 * Builds the `tasks` insert payload for the mobile quick-add sheet.
 *
 * `due_date` and `due_time` are split apart because the live table stores them
 * separately.
 */
export function toTaskInsert(
  input: {
    title: string;
    task_type: string;
    due_at: string;
    reminder_enabled: boolean;
    is_recurring?: boolean;
    recurrence_frequency?: string | null;
    lead_id?: string | null;
    customer_id?: string | null;
    professional_id?: string | null;
    related_entity_type?: string | null;
    related_entity_id?: string | null;
  },
  staffName: string,
): LiveTaskInsert {
  const due = input.due_at ? new Date(input.due_at) : null;
  const dueDate = due && !Number.isNaN(due.getTime())
    ? `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, '0')}-${String(
        due.getDate(),
      ).padStart(2, '0')}`
    : new Date().toISOString().slice(0, 10);
  const dueTime =
    due && !Number.isNaN(due.getTime())
      ? `${String(due.getHours()).padStart(2, '0')}:${String(due.getMinutes()).padStart(2, '0')}`
      : '09:00';

  const relatedType = input.related_entity_type ?? null;
  const relatedId = input.related_entity_id ?? null;

  return {
    title: input.title,
    type: input.task_type,
    due_date: dueDate,
    due_time: dueTime,
    status: 'Pending',
    priority: 'Medium',
    assigned_to: staffName,
    reminder: input.reminder_enabled,
    lead_id: input.lead_id ?? null,
    related_entity_type: relatedType,
    related_entity_id: relatedId,
    is_recurring: Boolean(input.is_recurring),
    recurrence_frequency: input.recurrence_frequency ?? null,
    created_by: staffName,
    updated_by: staffName,
  } as unknown as LiveTaskInsert;
}
