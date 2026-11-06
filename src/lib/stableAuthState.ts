import type { Session, User } from "@supabase/supabase-js";

// When the browser tab is opened again, the login library announces the same signed-in person once more.
// If every screen is then handed a brand-new user object, everything that depends on it reloads, which closes
// and resets whatever the person was doing (an open customer window, a file they just picked, and so on).
// These helpers keep the existing object whenever nothing about the person has changed.

export function keepSameUser(previous: User | null, next: User | null, event?: string): User | null {
  if (previous && next && previous.id === next.id && event !== "USER_UPDATED") return previous;
  return next;
}

export function keepSameSession(previous: Session | null, next: Session | null): Session | null {
  if (previous && next && previous.access_token === next.access_token && previous.user?.id === next.user?.id) {
    return previous;
  }
  return next;
}

interface ProfileLike {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  phone: string | null;
  is_active: boolean;
}

export function keepSameProfile<T extends ProfileLike>(previous: T | null, next: T): T {
  if (
    previous &&
    previous.id === next.id &&
    previous.email === next.email &&
    previous.full_name === next.full_name &&
    previous.avatar_url === next.avatar_url &&
    previous.phone === next.phone &&
    previous.is_active === next.is_active
  ) {
    return previous;
  }
  return next;
}
