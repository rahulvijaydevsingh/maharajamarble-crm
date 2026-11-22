import { describe, expect, it } from 'vitest';

import {
  PENDING_CALL_STORAGE_KEY,
  PENDING_CALL_TTL_MS,
  clearPendingCall,
  isPendingCallValid,
  readPendingCall,
  recordCallIntent,
  writePendingCall,
} from '@/mobile/hooks/useCallIntentWatcher';
import { createFakeStorage, installFakeWindow } from './helpers/browser';

const TARGET = {
  entityType: 'lead' as const,
  entityId: 'lead-1',
  entityName: 'Test Customer',
  phone: '9829112233',
  taskId: 'task-1',
};

describe('pending call intent storage', () => {
  it('uses the mm_pending_call_v1 key', () => {
    expect(PENDING_CALL_STORAGE_KEY).toBe('mm_pending_call_v1');
  });

  it('persists the intent under that key', () => {
    const storage = createFakeStorage();
    const { restore } = installFakeWindow({ localStorage: storage });
    try {
      recordCallIntent(TARGET);
      const raw = storage.getItem(PENDING_CALL_STORAGE_KEY);
      expect(raw).not.toBeNull();
      const parsed = JSON.parse(raw as string);
      expect(parsed.entityId).toBe('lead-1');
      expect(parsed.entityName).toBe('Test Customer');
      expect(parsed.taskId).toBe('task-1');
      expect(typeof parsed.startedAt).toBe('number');
    } finally {
      restore();
    }
  });

  it('reads back what it wrote', () => {
    const storage = createFakeStorage();
    const { restore } = installFakeWindow({ localStorage: storage });
    try {
      recordCallIntent(TARGET);
      const pending = readPendingCall();
      expect(pending).not.toBeNull();
      expect(pending?.entityId).toBe('lead-1');
      expect(pending?.phone).toBe('9829112233');
    } finally {
      restore();
    }
  });

  it('clears the intent on dismiss', () => {
    const storage = createFakeStorage();
    const { restore } = installFakeWindow({ localStorage: storage });
    try {
      recordCallIntent(TARGET);
      expect(readPendingCall()).not.toBeNull();
      clearPendingCall();
      expect(storage.getItem(PENDING_CALL_STORAGE_KEY)).toBeNull();
      expect(readPendingCall()).toBeNull();
    } finally {
      restore();
    }
  });

  it('returns null for malformed stored JSON', () => {
    const storage = createFakeStorage({ [PENDING_CALL_STORAGE_KEY]: '{not json' });
    const { restore } = installFakeWindow({ localStorage: storage });
    try {
      expect(readPendingCall()).toBeNull();
    } finally {
      restore();
    }
  });
});

describe('pending call TTL', () => {
  it('uses a 30 minute window', () => {
    expect(PENDING_CALL_TTL_MS).toBe(30 * 60 * 1000);
  });

  it('accepts a call that is still inside the window', () => {
    const now = 1_700_000_000_000;
    const call = {
      entityType: 'lead' as const,
      entityId: 'lead-1',
      entityName: 'Test Customer',
      phone: '9829112233',
      startedAt: now - (PENDING_CALL_TTL_MS - 1000),
    };
    expect(isPendingCallValid(call, now)).toBe(true);
  });

  it('expires a call that is older than 30 minutes', () => {
    const now = 1_700_000_000_000;
    const call = {
      entityType: 'lead' as const,
      entityId: 'lead-1',
      entityName: 'Test Customer',
      phone: '9829112233',
      startedAt: now - (PENDING_CALL_TTL_MS + 1000),
    };
    expect(isPendingCallValid(call, now)).toBe(false);
  });

  it('rejects a null or malformed call', () => {
    expect(isPendingCallValid(null, 1_700_000_000_000)).toBe(false);
    expect(isPendingCallValid(undefined, 1_700_000_000_000)).toBe(false);
  });

  it('tolerates a small amount of clock skew', () => {
    const now = 1_700_000_000_000;
    const call = {
      entityType: 'lead' as const,
      entityId: 'lead-1',
      entityName: 'Test Customer',
      phone: '9829112233',
      startedAt: now + 30_000,
    };
    expect(isPendingCallValid(call, now)).toBe(true);
  });

  it('rejects a timestamp that is too far in the future', () => {
    const now = 1_700_000_000_000;
    const call = {
      entityType: 'lead' as const,
      entityId: 'lead-1',
      entityName: 'Test Customer',
      phone: '9829112233',
      startedAt: now + 120_000,
    };
    expect(isPendingCallValid(call, now)).toBe(false);
  });

  it('rejects a stored value without a numeric startedAt', () => {
    const storage = createFakeStorage({
      [PENDING_CALL_STORAGE_KEY]: JSON.stringify({ entityId: 'lead-1' }),
    });
    const { restore } = installFakeWindow({ localStorage: storage });
    try {
      expect(readPendingCall()).toBeNull();
    } finally {
      restore();
    }
  });

  it('writes a state whose startedAt always validates', () => {
    const storage = createFakeStorage();
    const { restore } = installFakeWindow({ localStorage: storage });
    try {
      const written = recordCallIntent(TARGET);
      expect(isPendingCallValid(written, written.startedAt)).toBe(true);
      writePendingCall(written);
      expect(readPendingCall()).not.toBeNull();
    } finally {
      restore();
    }
  });
});
