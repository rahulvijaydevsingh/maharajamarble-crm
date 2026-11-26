/**
 * INVARIANT-04 guard.
 *
 * `assigned_to`, `created_by` and `updated_by` across every table must store a
 * staff **full name** string — never a UUID and never an email address.
 *
 * The live `useActiveStaff()` hook maps `profiles.full_name` to a `name`
 * property but falls back to `p.email` when a profile has no full name, so a
 * naive read of that list can leak an email into an attribution column. Every
 * mobile write path therefore runs its attribution value through
 * `resolveSafeStaffName` first.
 */

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A looser pattern that also catches malformed UUID-like blobs (for example a
 * 9 character first group). An attribution column must never receive one of
 * those either, so the guard is deliberately wider than RFC 4122.
 */
const UUID_LIKE_PATTERN =
  /^[0-9a-f]{8,}-[0-9a-f]{4,}-[0-9a-f]{4,}-[0-9a-f]{4,}-[0-9a-f]{8,}$/i;

/** True when the value looks like an email address rather than a display name. */
export function isEmailLike(value?: string | null): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.includes('@');
}

/** True when the value looks like a bare UUID rather than a display name. */
export function isUuidLike(value?: string | null): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  return UUID_PATTERN.test(trimmed) || UUID_LIKE_PATTERN.test(trimmed);
}

/**
 * True when the value is usable as a staff attribution name: a non-empty
 * string that is neither an email address nor a UUID.
 */
export function isSafeStaffName(value?: string | null): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (isEmailLike(trimmed)) return false;
  if (isUuidLike(trimmed)) return false;
  return true;
}

/**
 * Resolve a safe attribution name.
 *
 * The **second** argument wins: it is the signed-in user's profile full name
 * (`useAuth().profile?.full_name`). When that is missing or unsafe the first
 * argument (for example a `useActiveStaffOptions()` label) is used, but only
 * when it is also safe.
 *
 * The argument names below make that priority explicit — the first parameter
 * is the *secondary* source and the second one is the *preferred* source, so a
 * caller can never be surprised about which value is stored.
 *
 * Returns `null` when neither source yields a usable name, so callers can fall
 * back to a known-safe value rather than writing an email into the database.
 */
export function resolveSafeStaffName(
  /** Secondary source: a staff option label or other display name. */
  candidateLabel?: string | null,
  /** Preferred source: the signed-in user's profile full name. */
  signedInFullName?: string | null,
): string | null {
  if (isSafeStaffName(signedInFullName)) {
    return (signedInFullName as string).trim();
  }
  if (isSafeStaffName(candidateLabel)) {
    return (candidateLabel as string).trim();
  }
  return null;
}

/**
 * Same as {@link resolveSafeStaffName} but never returns `null` — it falls back
 * to the supplied last resort (default "System"). Use this when a column is
 * NOT NULL and an attribution must always be written.
 */
export function requireSafeStaffName(
  /** Secondary source: a staff option label or other display name. */
  candidateLabel?: string | null,
  /** Preferred source: the signed-in user's profile full name. */
  signedInFullName?: string | null,
  lastResort = 'System',
): string {
  return resolveSafeStaffName(candidateLabel, signedInFullName) ?? lastResort;
}

/**
 * Strips the optional " (Role)" suffix that `useActiveStaffOptions()` appends
 * to each option label, then runs the value through the safety guard.
 */
export function staffNameFromOptionLabel(
  label?: string | null,
  /** Preferred source: the signed-in user's profile full name. */
  signedInFullName?: string | null,
): string | null {
  if (typeof label !== 'string') return resolveSafeStaffName(null, signedInFullName);
  const withoutRole = label.replace(/\s*\([^)]*\)\s*$/, '').trim();
  return resolveSafeStaffName(withoutRole, signedInFullName);
}
