/**
 * Pure helpers for the mobile quick-add entity picker.
 *
 * The sheet used to default to the first lead and silently fell back to
 * `entityChoices[0]` whenever the preselected entity was missing. That meant a
 * task or a note could end up attached to the wrong person without the user
 * ever seeing it. These helpers keep the decision table here, so the behaviour
 * is unit testable without a DOM.
 */

import type { EntityKind } from '@/mobile/types/crmTypes';

/** One selectable person (lead, customer or professional) in the picker. */
export interface QuickAddEntityChoice {
  /** Stable identity: `<entityType>:<entityId>`. */
  key: string;
  /** Display name of the person. */
  label: string;
  /** Secondary line — the entity type, the phone number, … */
  sublabel?: string;
  entityType: EntityKind;
  entityId: string;
  /** A disabled choice can be shown but never selected. */
  disabled?: boolean;
}

/** The entity the sheet was opened for, if any. */
export interface QuickAddPreselectedEntity {
  entityType: EntityKind;
  entityId: string;
}

/** The canonical blocking message shown when nothing valid is selected. */
export const QUICK_ADD_ENTITY_REQUIRED_MESSAGE = 'Choose who this belongs to before saving.';

/** Maximum number of matches rendered by the picker list. */
export const QUICK_ADD_ENTITY_SEARCH_CAP = 50;

/** The picker key of a preselected entity. */
export function quickAddEntityKey(entityType: EntityKind, entityId: string): string {
  return `${entityType}:${entityId}`;
}

/**
 * Resolves the key the sheet starts with.
 *
 * Returns `null` when the selection cannot be resolved — there is never a
 * fallback to `choices[0]`, because guessing an owner attaches a task or a
 * note to the wrong person.
 */
export function resolveInitialEntityKey(
  choices: QuickAddEntityChoice[],
  preselected?: QuickAddPreselectedEntity | null,
): string | null {
  if (!preselected) return null;

  const key = quickAddEntityKey(preselected.entityType, preselected.entityId);
  const match = choices.find((choice) => choice.key === key);
  if (!match || match.disabled) return null;
  return key;
}

/**
 * The blocking message for the current selection, or `null` when the
 * selection is valid and the sheet may be saved.
 */
export function resolveQuickAddEntityError(
  choices: QuickAddEntityChoice[],
  selectedKey?: string | null,
  preselected?: QuickAddPreselectedEntity | null,
): string | null {
  const key = typeof selectedKey === 'string' ? selectedKey.trim() : '';
  const match = key ? choices.find((choice) => choice.key === key) : undefined;

  if (match && !match.disabled) return null;

  const preselectedKey = preselected
    ? quickAddEntityKey(preselected.entityType, preselected.entityId)
    : null;

  if (choices.length === 0) {
    return `There are no contacts to attach this to yet. ${QUICK_ADD_ENTITY_REQUIRED_MESSAGE}`;
  }

  if (preselectedKey && (key === preselectedKey || !key)) {
    // The lead the sheet was opened for is gone (deleted, or lost) — say so
    // instead of silently attaching the task to somebody else.
    return `The preselected contact is no longer available. ${QUICK_ADD_ENTITY_REQUIRED_MESSAGE}`;
  }

  return QUICK_ADD_ENTITY_REQUIRED_MESSAGE;
}

/**
 * Case-insensitive search over the label and the sublabel of every choice,
 * capped at `cap` matches so the list never grows unbounded.
 */
export function filterEntityChoices(
  choices: QuickAddEntityChoice[],
  query?: string | null,
  cap: number = QUICK_ADD_ENTITY_SEARCH_CAP,
): QuickAddEntityChoice[] {
  const limit = typeof cap === 'number' && cap >= 0 ? Math.floor(cap) : 0;
  const needle = typeof query === 'string' ? query.trim().toLowerCase() : '';

  const matches = needle
    ? choices.filter((choice) => {
        const label = (choice.label ?? '').toLowerCase();
        const sublabel = (choice.sublabel ?? '').toLowerCase();
        return label.includes(needle) || sublabel.includes(needle);
      })
    : choices;

  return matches.slice(0, limit);
}
