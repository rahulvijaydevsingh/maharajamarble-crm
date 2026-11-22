import { describe, expect, it } from 'vitest';

import {
  MOBILE_BREAKPOINT,
  WORKSPACE_PREF_STORAGE_KEY,
  buildMobilePath,
  isMobileViewport,
  mapDesktopPathToMobile,
  mapMobilePathToDesktop,
  parseMobilePath,
  readWorkspacePreference,
  writeWorkspacePreference,
} from '@/mobile/routing/workspacePreference';
import { createFakeStorage, installFakeWindow } from './helpers/browser';

describe('workspace viewport gate', () => {
  it('treats anything below 768px as the mobile workspace', () => {
    expect(MOBILE_BREAKPOINT).toBe(768);
    expect(isMobileViewport(320)).toBe(true);
    expect(isMobileViewport(375)).toBe(true);
    expect(isMobileViewport(430)).toBe(true);
    expect(isMobileViewport(767)).toBe(true);
  });

  it('never treats 768px or wider as the mobile workspace', () => {
    expect(isMobileViewport(768)).toBe(false);
    expect(isMobileViewport(1024)).toBe(false);
    expect(isMobileViewport(1920)).toBe(false);
  });

  it('reads the viewport width from the window when no width is supplied', () => {
    const { restore } = installFakeWindow({ innerWidth: 375 });
    try {
      expect(isMobileViewport()).toBe(true);
    } finally {
      restore();
    }

    const desktop = installFakeWindow({ innerWidth: 1280 });
    try {
      expect(isMobileViewport()).toBe(false);
    } finally {
      desktop.restore();
    }
  });
});

describe('workspace preference persistence', () => {
  it('defaults to the mobile workspace when nothing is stored', () => {
    const { restore } = installFakeWindow({ localStorage: createFakeStorage() });
    try {
      expect(readWorkspacePreference()).toBe('mobile');
    } finally {
      restore();
    }
  });

  it('persists the desktop preference under mm_workspace_pref_v1', () => {
    const storage = createFakeStorage();
    const { restore } = installFakeWindow({ localStorage: storage });
    try {
      writeWorkspacePreference('desktop');
      expect(storage.getItem(WORKSPACE_PREF_STORAGE_KEY)).toBe('desktop');
      expect(readWorkspacePreference()).toBe('desktop');
    } finally {
      restore();
    }
  });

  it('persists the mobile preference and reads it back', () => {
    const storage = createFakeStorage();
    const { restore } = installFakeWindow({ localStorage: storage });
    try {
      writeWorkspacePreference('mobile');
      expect(storage.getItem(WORKSPACE_PREF_STORAGE_KEY)).toBe('mobile');
      expect(readWorkspacePreference()).toBe('mobile');
    } finally {
      restore();
    }
  });

  it('treats an unknown stored value as the mobile workspace', () => {
    const storage = createFakeStorage({ [WORKSPACE_PREF_STORAGE_KEY]: 'nonsense' });
    const { restore } = installFakeWindow({ localStorage: storage });
    try {
      expect(readWorkspacePreference()).toBe('mobile');
    } finally {
      restore();
    }
  });
});

describe('mobile path <-> route mapping', () => {
  it('builds the expected URL for every main route', () => {
    expect(buildMobilePath({ name: 'today' })).toBe('/m/today');
    expect(buildMobilePath({ name: 'work' })).toBe('/m/work');
    expect(buildMobilePath({ name: 'people' })).toBe('/m/people');
    expect(buildMobilePath({ name: 'more' })).toBe('/m/more');
    expect(buildMobilePath({ name: 'messages' })).toBe('/m/messages');
    expect(buildMobilePath({ name: 'lead_form', mode: 'create' })).toBe('/m/lead/new');
    expect(buildMobilePath({ name: 'lead_form', mode: 'edit', leadId: 'abc' })).toBe(
      '/m/lead/abc/edit',
    );
    expect(buildMobilePath({ name: 'customer_edit', customerId: 'c1' })).toBe(
      '/m/customer/c1/edit',
    );
    expect(buildMobilePath({ name: 'professional_edit', professionalId: 'p1' })).toBe(
      '/m/professional/p1/edit',
    );
  });

  it('parses the entity profile route back into its parts', () => {
    expect(parseMobilePath('/m/people/lead/abc')).toEqual({
      name: 'entity_profile',
      entityType: 'lead',
      entityId: 'abc',
    });
    expect(parseMobilePath('/m/people/customer/c1')).toEqual({
      name: 'entity_profile',
      entityType: 'customer',
      entityId: 'c1',
    });
    expect(parseMobilePath('/m/people/professional/p1')).toEqual({
      name: 'entity_profile',
      entityType: 'professional',
      entityId: 'p1',
    });
  });

  it('parses the lead form route in both modes', () => {
    expect(parseMobilePath('/m/lead/new')).toEqual({ name: 'lead_form', mode: 'create' });
    expect(parseMobilePath('/m/lead/abc/edit')).toEqual({
      name: 'lead_form',
      mode: 'edit',
      leadId: 'abc',
    });
  });

  it('returns null for paths outside the mobile workspace', () => {
    expect(parseMobilePath('/leads')).toBeNull();
    expect(parseMobilePath('/m')).toEqual({ name: 'today' });
    expect(parseMobilePath('')).toBeNull();
  });
});

describe('bidirectional deep-link mapping', () => {
  it('maps a desktop lead link onto the mobile entity profile', () => {
    expect(mapDesktopPathToMobile('/leads', '?view=abc')).toBe('/m/people/lead/abc');
  });

  it('maps a desktop customer link onto the mobile entity profile', () => {
    expect(mapDesktopPathToMobile('/customers', '?view=abc')).toBe('/m/people/customer/abc');
  });

  it('maps a desktop professional link onto the mobile entity profile', () => {
    expect(mapDesktopPathToMobile('/professionals', '?view=abc')).toBe(
      '/m/people/professional/abc',
    );
  });

  it('maps a desktop task link onto the mobile work screen', () => {
    expect(mapDesktopPathToMobile('/tasks', '?view=t1')).toBe('/m/work/t1');
  });

  it('maps desktop list links onto the matching mobile filter', () => {
    expect(mapDesktopPathToMobile('/leads', '')).toBe('/m/people/leads');
    expect(mapDesktopPathToMobile('/customers', '')).toBe('/m/people/customers');
    expect(mapDesktopPathToMobile('/professionals', '')).toBe('/m/people/professionals');
    expect(mapDesktopPathToMobile('/tasks', '')).toBe('/m/work');
  });

  it('maps the desktop root onto the mobile today screen', () => {
    expect(mapDesktopPathToMobile('/', '')).toBe('/m/today');
  });

  it('returns null for a desktop path with no mobile equivalent', () => {
    expect(mapDesktopPathToMobile('/quotations', '')).toBeNull();
    expect(mapDesktopPathToMobile('/settings', '')).toBeNull();
  });

  it('never maps a URL that is already inside the mobile workspace', () => {
    // This is the loop-prevention rule: the desktop -> mobile mapper must
    // refuse to touch /m/* paths, otherwise the two surfaces could bounce a
    // user back and forth forever.
    expect(mapDesktopPathToMobile('/m/today', '')).toBeNull();
    expect(mapDesktopPathToMobile('/m/people/lead/abc', '')).toBeNull();
  });

  it('maps mobile entity profiles back to their desktop counterparts', () => {
    expect(mapMobilePathToDesktop('/m/people/lead/abc')).toBe('/leads?view=abc');
    expect(mapMobilePathToDesktop('/m/people/customer/c1')).toBe('/customers?view=c1');
    expect(mapMobilePathToDesktop('/m/people/professional/p1')).toBe('/professionals?view=p1');
  });

  it('maps a mobile task link back to the desktop task link', () => {
    expect(mapMobilePathToDesktop('/m/work/t1')).toBe('/tasks?view=t1');
    expect(mapMobilePathToDesktop('/m/work')).toBe('/tasks');
  });

  it('returns null when a mobile path has no desktop counterpart', () => {
    expect(mapMobilePathToDesktop('/leads')).toBeNull();
    expect(mapMobilePathToDesktop('/m/handoff/leads')).toBeNull();
  });

  it('round-trips a desktop lead link through the mobile workspace', () => {
    const mobile = mapDesktopPathToMobile('/leads', '?view=abc');
    expect(mobile).not.toBeNull();
    expect(mapMobilePathToDesktop(mobile as string)).toBe('/leads?view=abc');
  });
});
