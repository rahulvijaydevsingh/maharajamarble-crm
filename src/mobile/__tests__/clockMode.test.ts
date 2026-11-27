import { describe, expect, it } from 'vitest';

import {
  clockModeLabel,
  formatAttendanceHours,
  formatAttendanceTime,
  getAttendanceDateKey,
  resolveAttendanceStatus,
  resolveClockMode,
  type AttendanceTodayRecord,
} from '@/mobile/lib/clockMode';

describe('getAttendanceDateKey', () => {
  it('uses the UTC calendar date shared with the desktop and Edge Functions', () => {
    // 2026-11-27 18:58 UTC is 2026-11-28 00:28 in India, but attendance
    // remains keyed to the UTC date used by hr-clock-in.
    expect(getAttendanceDateKey(new Date('2026-11-27T18:58:00.000Z'))).toBe('2026-11-27');
  });
});

describe('resolveAttendanceStatus', () => {
  it('recognizes no attendance record', () => {
    expect(resolveAttendanceStatus(null)).toBe('not_clocked_in');
    expect(resolveAttendanceStatus(undefined)).toBe('not_clocked_in');
  });

  it('recognizes an active shift', () => {
    expect(resolveAttendanceStatus({ clock_in: '2026-11-26T09:00:00.000Z' })).toBe('clocked_in');
  });

  it('recognizes a completed shift', () => {
    expect(resolveAttendanceStatus({
      clock_in: '2026-11-26T09:00:00.000Z',
      clock_out: '2026-11-26T18:00:00.000Z',
    })).toBe('clocked_out');
  });
});

describe('attendance formatters', () => {
  it('formats valid timestamps in 12-hour en-IN time', () => {
    expect(formatAttendanceTime('2026-11-26T06:45:00.000Z')).toMatch(/\d{1,2}:\d{2} [AP]M/);
  });

  it('returns an empty string for missing or invalid timestamps', () => {
    expect(formatAttendanceTime(null)).toBe('');
    expect(formatAttendanceTime(undefined)).toBe('');
    expect(formatAttendanceTime('not-a-date')).toBe('');
  });

  it('formats only positive finite hour totals', () => {
    expect(formatAttendanceHours(8.5)).toBe('8.5h');
    expect(formatAttendanceHours(8)).toBe('8h');
    expect(formatAttendanceHours(null)).toBe('');
    expect(formatAttendanceHours(undefined)).toBe('');
    expect(formatAttendanceHours(0)).toBe('');
    expect(formatAttendanceHours(Number.NaN)).toBe('');
    expect(formatAttendanceHours(Number.POSITIVE_INFINITY)).toBe('');
  });
});

describe('resolveClockMode remains compatible with the modal contract', () => {
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

  it('does not offer a duplicate clock in after a completed shift', () => {
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
