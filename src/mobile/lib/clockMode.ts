/**
 * Clock in / clock out mode for the mobile workspace.
 *
 * The desktop attendance screen (`src/pages/HRAttendance.tsx`) derives today's
 * attendance state from a single `attendance_records` row for the signed-in
 * staff member:
 *
 *  - no row for today            → `not_clocked_in` → the user can Clock In,
 *  - `clock_in` and no `clock_out` → `clocked_in`    → the user can Clock Out,
 *  - `clock_in` and `clock_out`   → `clocked_out`    → the day is complete.
 *
 * The mobile workspace needs the same decision so the Today / More buttons can
 * offer the *other* half of the attendance pair. The pure helper below is the
 * single source of truth for that mapping and is unit tested without a browser.
 */

/** Which half of the attendance pair the modal should offer. */
export type ClockMode = 'clock-in' | 'clock-out';

/** The minimal shape of today's attendance row the mode depends on. */
export interface AttendanceTodayRecord {
  clock_in?: string | null;
  clock_out?: string | null;
}

/**
 * Resolves the clock mode for the given attendance record.
 *
 * - `null` / `undefined` record → `clock-in` (nothing recorded today),
 * - `clock_in` without `clock_out` → `clock-out` (still on the clock),
 * - both present → `clock-in` (the day is already complete).
 */
export function resolveClockMode(
  record?: AttendanceTodayRecord | null,
): ClockMode {
  if (!record) return 'clock-in';
  if (record.clock_in && !record.clock_out) return 'clock-out';
  return 'clock-in';
}

/** Human label for the clock action button. */
export function clockModeLabel(mode: ClockMode): string {
  return mode === 'clock-out' ? 'Clock Out' : 'Clock In';
}
