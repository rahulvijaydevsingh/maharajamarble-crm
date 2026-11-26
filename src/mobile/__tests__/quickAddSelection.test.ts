import { describe, expect, it } from 'vitest';

import {
  QUICK_ADD_ENTITY_REQUIRED_MESSAGE,
  filterEntityChoices,
  resolveInitialEntityKey,
  resolveQuickAddEntityError,
  type QuickAddEntityChoice,
} from '@/mobile/lib/quickAddSelection';

const CHOICES: QuickAddEntityChoice[] = [
  { key: 'lead:l1', label: 'Ramesh Kumar', sublabel: 'Lead · +91 98291 12233', entityType: 'lead', entityId: 'l1' },
  { key: 'lead:l2', label: 'Sita Devi', sublabel: 'Lead · +91 98291 12234', entityType: 'lead', entityId: 'l2' },
  { key: 'customer:c1', label: 'Maharaja Builders', sublabel: 'Customer', entityType: 'customer', entityId: 'c1' },
  { key: 'professional:p1', label: 'Ravi Stone', sublabel: 'Professional', entityType: 'professional', entityId: 'p1' },
];

describe('resolveInitialEntityKey', () => {
  it('resolves an explicit preselection that still exists', () => {
    expect(resolveInitialEntityKey(CHOICES, { entityType: 'lead', entityId: 'l1' })).toBe('lead:l1');
    expect(resolveInitialEntityKey(CHOICES, { entityType: 'customer', entityId: 'c1' })).toBe('customer:c1');
  });

  it('never falls back to the first choice when there is no preselection', () => {
    expect(resolveInitialEntityKey(CHOICES)).toBeNull();
    expect(resolveInitialEntityKey(CHOICES, null)).toBeNull();
    expect(resolveInitialEntityKey([])).toBeNull();
  });

  it('stays unresolved when the preselected lead is gone (deleted or lost)', () => {
    // The lost lead is filtered out of the choices — the sheet must not swap
    // it for somebody else.
    expect(resolveInitialEntityKey(CHOICES, { entityType: 'lead', entityId: 'lost-1' })).toBeNull();
  });

  it('stays unresolved when the preselected choice is disabled', () => {
    const disabled: QuickAddEntityChoice[] = [{ ...CHOICES[0], disabled: true }];
    expect(resolveInitialEntityKey(disabled, { entityType: 'lead', entityId: 'l1' })).toBeNull();
  });
});

describe('resolveQuickAddEntityError', () => {
  it('has no error for a valid explicit selection', () => {
    expect(resolveQuickAddEntityError(CHOICES, 'lead:l2')).toBeNull();
    expect(resolveQuickAddEntityError(CHOICES, 'customer:c1')).toBeNull();
  });

  it('blocks the save while nothing is selected', () => {
    const error = resolveQuickAddEntityError(CHOICES, '');
    expect(error).toBe(QUICK_ADD_ENTITY_REQUIRED_MESSAGE);
    expect(error).toContain('Choose who this belongs to before saving.');
  });

  it('blocks the save when the preselected lead was lost', () => {
    const error = resolveQuickAddEntityError(CHOICES, 'lead:lost-1', {
      entityType: 'lead',
      entityId: 'lost-1',
    });
    expect(error).not.toBeNull();
    expect(error).toContain('Choose who this belongs to before saving.');
    expect(error?.toLowerCase()).toContain('preselected');
  });

  it('blocks the save when the preselection cannot be resolved at all', () => {
    const error = resolveQuickAddEntityError(CHOICES, '', { entityType: 'lead', entityId: 'lost-1' });
    expect(error).not.toBeNull();
    expect(error).toContain('Choose who this belongs to before saving.');
  });

  it('clears the error as soon as the user picks somebody else', () => {
    expect(resolveQuickAddEntityError(CHOICES, 'lead:l1', { entityType: 'lead', entityId: 'lost-1' })).toBeNull();
  });

  it('blocks a disabled choice', () => {
    const disabled: QuickAddEntityChoice[] = [{ ...CHOICES[0], disabled: true }];
    expect(resolveQuickAddEntityError(disabled, 'lead:l1')).not.toBeNull();
  });

  it('blocks the save when there is nobody to attach to', () => {
    const error = resolveQuickAddEntityError([], '');
    expect(error).not.toBeNull();
    expect(error).toContain('Choose who this belongs to before saving.');
  });
});

describe('filterEntityChoices', () => {
  it('matches the label case-insensitively', () => {
    expect(filterEntityChoices(CHOICES, 'ramesh').map((choice) => choice.key)).toEqual(['lead:l1']);
    expect(filterEntityChoices(CHOICES, 'RAMESH').map((choice) => choice.key)).toEqual(['lead:l1']);
  });

  it('matches the sublabel case-insensitively', () => {
    expect(filterEntityChoices(CHOICES, 'PROFESSIONAL').map((choice) => choice.key)).toEqual(['professional:p1']);
    expect(filterEntityChoices(CHOICES, '+91 98291 12233').map((choice) => choice.key)).toEqual(['lead:l1']);
  });

  it('returns nothing for a query that matches nobody', () => {
    expect(filterEntityChoices(CHOICES, 'nobody-here')).toEqual([]);
  });

  it('returns every choice for an empty query', () => {
    expect(filterEntityChoices(CHOICES, '')).toHaveLength(CHOICES.length);
    expect(filterEntityChoices(CHOICES, '   ')).toHaveLength(CHOICES.length);
  });

  it('caps the result at 50 matches', () => {
    const many: QuickAddEntityChoice[] = Array.from({ length: 120 }, (_, index) => ({
      key: `lead:${index}`,
      label: `Contact ${index}`,
      sublabel: 'Lead',
      entityType: 'lead',
      entityId: String(index),
    }));

    expect(filterEntityChoices(many, 'contact')).toHaveLength(50);
    expect(filterEntityChoices(many, '')).toHaveLength(50);
    expect(filterEntityChoices(many, 'contact', 10)).toHaveLength(10);
  });
});
