import { describe, expect, it } from 'vitest';

import {
  jsonToString,
  parseAdditionalContacts,
  serializeAdditionalContacts,
  toPriorityNumber,
  toMobileLead,
  toMobileTask,
} from '@/mobile/lib/mappers';
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
});

describe('task mapper', () => {
  it('combines due_date and due_time into one timestamp', () => {
    const task = toMobileTask(liveTask());
    expect(task.due_at).toContain('2026-11-25');
    expect(task.due_at).toContain('10:30');
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
