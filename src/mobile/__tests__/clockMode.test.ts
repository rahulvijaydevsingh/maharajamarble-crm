import { describe, expect, it } from 'vitest';

import {
  clockModeLabel,
  resolveClockMode,
  type AttendanceTodayRecord,
} from '@/mobile/lib/clockMode';

describe('resolveClockMode mirrors the desktop attendance state machine', () => {
  it('offers clock in when nothing was recorded today', () => {
    expect(resolveClockMode(null)).toBe('clock-in');
    expect(resolveClockMode(undefined)).toBe('clock-in');
    expect(resolveClockMode({ clock_in: null, clock_out: null })).toBe('clock-in');
  });

  it('offers clock out while the staff member is still on the clock', () => {
    const record: AttendanceTodayRecord = {
      clock_in: '2026-11-26T09:00:00.000Z',
      clock_out: null,
    };
    expect(resolveClockMode(record)).toBe('clock-out');
  });

  it('falls back to clock in once the day is complete', () => {
    const record: AttendanceTodayRecord = {
      clock_in: '2026-11-26T09:00:00.000Z',
      clock_out: '2026-11-26T18:00:00.000Z',
    };
    expect(resolveClockMode(record)).toBe('clock-in');
  });
});

describe('clockModeLabel', () => {
  it('names the action the button performs', () => {
    expect(clockModeLabel('clock-in')).toBe('Clock In');
    expect(clockModeLabel('clock-out')).toBe('Clock Out');
  });
});
