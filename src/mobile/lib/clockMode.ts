/**
 * Attendance state helpers for the mobile workspace.
 *
 * The UI state mirrors the desktop attendance lifecycle while keeping
 * ClockMode as the two-value modal contract used by ClockInOutModal.
 */
export type ClockMode = 'clock-in' | 'clock-out';

export type AttendanceShiftStatus =
  | 'loading'
  | 'error'
  | 'not_clocked_in'
  | 'clocked_in'
  | 'clocked_out';

export interface AttendanceTodayRecord {
  clock_in?: string | null;
  clock_out?: string | null;
  total_hours?: number | null;
}

export interface AttendanceUiState {
  status: AttendanceShiftStatus;
  record: AttendanceTodayRecord | null;
  errorMessage?: string | null;
}

/**
 * Attendance records are keyed by UTC date in HRAttendance.tsx,
 * hr-clock-in, and hr-clock-out. This MUST remain UTC to match all three.
 */
export function getAttendanceDateKey(now: Date = new Date()): string {
  return now.toISOString().split('T')[0];
}

export function resolveAttendanceStatus(
  record?: AttendanceTodayRecord | null,
): 'not_clocked_in' | 'clocked_in' | 'clocked_out' {
  if (!record || !record.clock_in) return 'not_clocked_in';
  if (!record.clock_out) return 'clocked_in';
  return 'clocked_out';
}

/** Format a stored ISO timestamp as a clean 12-hour en-IN local time. */
export function formatAttendanceTime(iso?: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date).replace(/\b(am|pm)\b/i, (part) => part.toUpperCase());
}

/** Format positive finite hours without unnecessary trailing zeroes. */
export function formatAttendanceHours(hours?: number | null): string {
  if (typeof hours !== 'number' || !Number.isFinite(hours) || hours <= 0) return '';
  return `${Number(hours.toFixed(2))}h`;
}

/** Backwards-compatible modal mode helper for existing mobile callers. */
export function resolveClockMode(
  record?: AttendanceTodayRecord | null,
): ClockMode {
  return resolveAttendanceStatus(record) === 'clocked_in' ? 'clock-out' : 'clock-in';
}

/** Human label for the clock action button. */
export function clockModeLabel(mode: ClockMode): string {
  return mode === 'clock-out' ? 'Clock Out' : 'Clock In';
}
