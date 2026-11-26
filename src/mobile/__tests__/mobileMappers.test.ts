import { describe, expect, it } from 'vitest';

import {
  jsonToString,
  parseAdditionalContacts,
  parseReferredBy,
  serializeAdditionalContacts,
  toPriorityNumber,
  toMobileLead,
  toMobileTask,
} from '@/mobile/lib/mappers';
import { isLeadConverted } from '@/lib/leadConversionEligibility';
import type { Lead as LiveLead } from '@/hooks/useLeads';
import type { Task as LiveTaskRow } from '@/hooks/useTasks';

function liveLead(overrides: Partial<LiveLead> = {}): LiveLead {
  return {
    id: 'lead-1',
    created_at: '2026-01-01T00:00:00.000Z',
    created_by: 'Test Staff Member',
    updated_at: '2026-01-02T00:00:00.000Z',
    name: 'Test Customer',
    phone: '9829112233',
    alternate_phone: null,
    email: null,
    designation: 'architect',
    firm_name: null,
    additional_contacts: null,
    site_location: 'Civil Lines, Jaipur',
    site_photo_url: null,
    site_plus_code: '7JRQWR6P+XW',
    created_from_customer_id: null,
    construction_stage: 'plastering',
    estimated_quantity: 1200,
    material_interests: ['italian_marble'],
    source: 'walk_in',
    referred_by: null,
    assigned_to: 'Test Staff Member',
    status: 'new',
    priority: 3,
    notes: null,
    address: 'Civil Lines, Jaipur',
    last_follow_up: null,
    next_follow_up: '2026-11-25T10:00:00.000Z',
    updated_by: 'Test Staff Member',
    ...overrides,
  };
}

function liveTask(overrides: Partial<LiveTaskRow> = {}): LiveTaskRow {
  return {
    id: 'task-1',
    created_at: '2026-01-01T00:00:00.000Z',
    created_by: 'Test Staff Member',
    updated_at: '2026-01-02T00:00:00.000Z',
    title: 'Call back about the quote',
    description: null,
    type: 'Follow-up Call',
    priority: 'Medium',
    status: 'Pending',
    assigned_to: 'Test Staff Member',
    due_date: '2026-11-25',
    due_time: '10:30',
    lead_id: 'lead-1',
    reminder: true,
    reminder_time: null,
    completed_at: null,
    is_starred: false,
    related_entity_type: null,
    related_entity_id: null,
    is_recurring: false,
    recurrence_frequency: null,
    recurrence_interval: 0,
    recurrence_days_of_week: null,
    recurrence_day_of_month: null,
    recurrence_month: null,
    recurrence_reset_from_completion: false,
    recurrence_end_type: 'never',
    recurrence_end_date: null,
    recurrence_occurrences_limit: null,
    recurrence_occurrences_count: 0,
    parent_task_id: null,
    snoozed_until: null,
    original_due_date: null,
    lead: {
      id: 'lead-1',
      name: 'Test Customer',
      phone: '9829112233',
      site_plus_code: '7JRQWR6P+XW',
      status: 'new',
    },
    ...overrides,
  } as LiveTaskRow;
}

describe('lead mapper', () => {
  it('maps the live column names onto the mobile view model', () => {
    const lead = toMobileLead(liveLead());
    expect(lead.full_name).toBe('Test Customer');
    expect(lead.lead_source).toBe('walk_in');
    expect(lead.plus_code).toBe('7JRQWR6P+XW');
    expect(lead.next_action_at).toBe('2026-11-25T10:00:00.000Z');
    expect(lead.estimated_qty_sqft).toBe(1200);
    expect(lead.material_interests).toEqual(['italian_marble']);
    expect(lead.priority).toBe(3);
    expect(lead.status).toBe('new');
  });

  it('derives reminder_enabled from the follow-up column', () => {
    expect(toMobileLead(liveLead()).reminder_enabled).toBe(true);
    expect(
      toMobileLead(liveLead({ next_follow_up: null })).reminder_enabled,
    ).toBe(false);
  });

  it('tolerates null collections', () => {
    const lead = toMobileLead(liveLead({ material_interests: null, additional_contacts: null }));
    expect(lead.material_interests).toEqual([]);
    expect(lead.additional_contacts).toEqual([]);
  });

  it('carries the conversion columns onto the mobile model', () => {
    // The desktop converts a lead by writing `status: 'won'` plus the
    // conversion columns. Without them the mobile badge and the conversion
    // action could never see that the lead became a customer.
    const converted = toMobileLead(
      liveLead({
        status: 'won',
        ...({
          is_converted: true,
          converted_to_customer_id: 'cust-1',
        } as unknown as Partial<LiveLead>),
      }),
    );
    expect(converted.status).toBe('won');
    expect(converted.is_converted).toBe(true);
    expect(converted.converted_to_customer_id).toBe('cust-1');
  });

  it('reports an unconverted lead as such', () => {
    const lead = toMobileLead(liveLead());
    expect(lead.is_converted).toBeNull();
    expect(lead.converted_to_customer_id).toBeNull();
    expect(isLeadConverted(lead)).toBe(false);
  });
});

describe('task mapper', () => {
  it('combines due_date and due_time into one timestamp', () => {
    const task = toMobileTask(liveTask());
    // `due_at` is an absolute timestamp, so its UTC rendering depends on the
    // machine timezone. The stored `due_date` / `due_time` pair is a LOCAL
    // wall-clock value, so the assertion has to read it back in local time —
    // otherwise the test only passes under TZ=UTC.
    const due = new Date(task.due_at);
    expect(Number.isNaN(due.getTime())).toBe(false);
    expect(due.getFullYear()).toBe(2026);
    expect(due.getMonth()).toBe(10); // November (0-based)
    expect(due.getDate()).toBe(25);
    expect(due.getHours()).toBe(10);
    expect(due.getMinutes()).toBe(30);
  });

  it('keeps the Control Panel title-case task type', () => {
    expect(toMobileTask(liveTask()).task_type).toBe('Follow-up Call');
  });

  it('maps the reminder flag', () => {
    expect(toMobileTask(liveTask({ reminder: true })).reminder_enabled).toBe(true);
    expect(toMobileTask(liveTask({ reminder: false })).reminder_enabled).toBe(false);
  });

  it('maps the joined lead', () => {
    const task = toMobileTask(liveTask());
    expect(task.lead?.full_name).toBe('Test Customer');
  });

  it('routes the related entity columns to the customer/professional ids', () => {
    const task = toMobileTask(
      liveTask({
        lead_id: null,
        related_entity_type: 'customer',
        related_entity_id: 'cust-1',
      }),
    );
    expect(task.customer_id).toBe('cust-1');
    expect(task.professional_id).toBeNull();
  });
});

describe('additional contacts JSONB', () => {
  it('reads the desktop JSONB shape', () => {
    const contacts = parseAdditionalContacts([
      {
        designation: 'architect',
        name: 'Test Professional',
        email: 'suresh@example.com',
        phone: '9829112234',
        alternatePhone: '9829112235',
        firmName: 'Studio 11',
        firm_name: 'Studio 11',
        professional_id: 'prof-1',
        isProfessional: true,
      },
    ] as never);

    expect(contacts).toHaveLength(1);
    expect(contacts[0].name).toBe('Test Professional');
    expect(contacts[0].phone).toBe('9829112234');
    expect(contacts[0].email).toBe('suresh@example.com');
    expect(contacts[0].alternate_phone).toBe('9829112235');
    expect(contacts[0].firm_name).toBe('Studio 11');
    expect(contacts[0].professional_id).toBe('prof-1');
    expect(contacts[0].is_professional).toBe(true);
  });

  it('never throws on malformed JSONB', () => {
    expect(parseAdditionalContacts(null)).toEqual([]);
    expect(parseAdditionalContacts('nope' as never)).toEqual([]);
    expect(parseAdditionalContacts([1, 'two', null] as never)).toEqual([]);
  });

  it('round-trips a contact through serialize and parse', () => {
    const original = [
      {
        id: 'ac-1',
        name: 'Test Professional',
        phone: '9829112234',
        relation: 'Site Architect',
        professional_id: 'prof-1',
        is_primary_contact: true,
      },
    ];
    const parsed = parseAdditionalContacts(serializeAdditionalContacts(original) as never);
    expect(parsed[0].name).toBe('Test Professional');
    expect(parsed[0].professional_id).toBe('prof-1');
    expect(parsed[0].is_primary_contact).toBe(true);
  });
});

describe('misc mappers', () => {
  it('coerces JSON values into strings', () => {
    expect(jsonToString('walk_in')).toBe('walk_in');
    expect(jsonToString(null)).toBeNull();
    expect(jsonToString(42)).toBe('42');
    expect(jsonToString({ a: 1 } as never)).toBeNull();
  });

  it('normalises the priority value', () => {
    expect(toPriorityNumber(3)).toBe(3);
    expect(toPriorityNumber('2')).toBe(2);
    expect(toPriorityNumber(null)).toBe(3);
    expect(toPriorityNumber('nonsense')).toBe(3);
  });
});

describe('desktop JSONB keys survive a mobile edit', () => {
  it('keeps an unknown desktop key on an additional contact', () => {
    // The desktop writes fields the mobile screens never render. Dropping
    // them on an edit silently changed the customer's data.
    const contacts = parseAdditionalContacts([
      {
        id: 'ac-1',
        name: 'Site Engineer',
        phone: '9829112233',
        designation: 'site_supervisor',
        gstin: '29ABCDE1234F1Z5',
        custom_note: 'Preferred contact',
      },
    ]);

    expect(contacts[0].name).toBe('Site Engineer');
    expect((contacts[0] as unknown as Record<string, unknown>).gstin).toBe(
      '29ABCDE1234F1Z5',
    );
  });

  it('writes the unknown keys back on serialization', () => {
    const contacts = parseAdditionalContacts([
      {
        id: 'ac-1',
        name: 'Site Engineer',
        phone: '9829112233',
        gstin: '29ABCDE1234F1Z5',
      },
    ]);

    const serialized = serializeAdditionalContacts(contacts);
    expect(serialized[0].gstin).toBe('29ABCDE1234F1Z5');
    expect(serialized[0].name).toBe('Site Engineer');
  });

  it('never writes the passthrough itself into the stored shape', () => {
    const contacts = parseAdditionalContacts([{ id: 'ac-1', name: 'A', phone: '9829112233' }]);
    const serialized = serializeAdditionalContacts(contacts);
    expect('raw' in serialized[0]).toBe(false);
  });

  it('round-trips the desktop shape without losing a key', () => {
    const original = [
      {
        id: 'ac-1',
        name: 'Site Engineer',
        phone: '9829112233',
        designation: 'site_supervisor',
        isProfessional: true,
        firm_name: 'Build Co',
        gstin: '29ABCDE1234F1Z5',
      },
    ];

    const serialized = serializeAdditionalContacts(parseAdditionalContacts(original));
    expect(serialized[0]).toMatchObject({
      id: 'ac-1',
      name: 'Site Engineer',
      phone: '9829112233',
      designation: 'site_supervisor',
      isProfessional: true,
      firm_name: 'Build Co',
      gstin: '29ABCDE1234F1Z5',
    });
  });
});

describe('leads.referred_by JSONB', () => {
  it('keeps the structured professional reference intact', () => {
    // The desktop stores a `ProfessionalRef` object here. Flattening it to a
    // string — or wiping it on edit — lost the referral.
    const referred = parseReferredBy({
      id: 'p1',
      name: 'Riya Architects',
      firmName: 'Riya & Co',
      type: 'architect',
      phone: '9829112233',
      email: 'riya@example.com',
    });

    expect(referred).toEqual({
      id: 'p1',
      name: 'Riya Architects',
      firmName: 'Riya & Co',
      type: 'architect',
      phone: '9829112233',
      email: 'riya@example.com',
    });
  });

  it('still reads a legacy free text referral', () => {
    expect(parseReferredBy('Mr. Sharma')).toBe('Mr. Sharma');
  });

  it('returns null for an empty value', () => {
    expect(parseReferredBy(null)).toBeNull();
    expect(parseReferredBy(undefined)).toBeNull();
    expect(parseReferredBy('')).toBeNull();
    expect(parseReferredBy({})).toBeNull();
  });

  it('never returns an object without an id or a name', () => {
    expect(parseReferredBy({ firmName: 'Riya & Co' })).toBeNull();
  });
});
