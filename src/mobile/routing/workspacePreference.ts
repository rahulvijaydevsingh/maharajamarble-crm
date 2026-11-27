/**
 * Workspace preference + deep-link mapping for the `/m` mobile workspace.
 *
 * Two responsibilities:
 *  1. Persist whether the field user wants the mobile workspace or the full
 *     desktop CRM (`mm_workspace_pref_v1`).
 *  2. Translate between desktop CRM URLs and mobile workspace URLs so a link
 *     shared from either surface opens on the other one.
 *
 * All helpers are pure (except the storage helpers) so they can be unit tested
 * in a node environment.
 */

import type { MobileRoute, WorkspacePref } from '@/mobile/types/crmTypes';

/** The mobile workspace is shown below this viewport width. */
export const MOBILE_BREAKPOINT = 768;

/** localStorage key holding the user's workspace preference. */
export const WORKSPACE_PREF_STORAGE_KEY = 'mm_workspace_pref_v1';

/**
 * Custom event dispatched whenever the preference changes, so components that
 * already render the workspace (the gate) can react immediately instead of
 * waiting for a remount.
 */
export const WORKSPACE_PREF_EVENT = 'mm_workspace_pref_change';

export const MOBILE_ROOT = '/m';

/**
 * Reserved `/m/work/:filter` tokens.
 *
 * These five segments are work-list filters, NOT task ids. Every other
 * segment below `/m/work/` is treated as a task id so `/m/work/t1` keeps
 * resolving to `/tasks?view=t1` on the desktop surface.
 */
export const WORK_FILTER_TOKENS = [
  'today',
  'overdue',
  'upcoming',
  'completed',
  'cancelled',
] as const;

export type WorkFilterToken = (typeof WORK_FILTER_TOKENS)[number];

/** True when `value` is one of the reserved `/m/work/:filter` tokens. */
export function isWorkFilterToken(value: string): value is WorkFilterToken {
  return (WORK_FILTER_TOKENS as readonly string[]).includes(value);
}

/**
 * `decodeURIComponent` that never throws.
 *
 * Malformed percent-encoding (`%ZZ`) makes `decodeURIComponent` throw a
 * `URIError`, which would take down a whole render. The raw value is returned
 * unchanged instead, so a broken deep link degrades to a readable URL instead
 * of an exception.
 */
export function safeDecodeURIComponent(value: string): string {
  if (typeof value !== 'string') return '';
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Resolves where the user should land after a successful sign-in.
 *
 * `ProtectedRoute` stores the attempted location in `state.from`. Only a
 * same-origin, absolute internal path is honoured: protocol-relative URLs
 * (`//evil.com`) and the auth screen itself are rejected so the redirect can
 * never be used as an open redirect.
 */
export function resolvePostAuthRedirect(from: unknown): string {
  const state = (from ?? null) as
    | { from?: { pathname?: string; search?: string; hash?: string } | null }
    | null;
  const source = state?.from;
  const pathname = typeof source?.pathname === 'string' ? source.pathname : '';

  if (!pathname.startsWith('/')) return '/';
  if (pathname.startsWith('//')) return '/';
  if (pathname === '/auth') return '/';

  const search = typeof source?.search === 'string' && source.search.startsWith('?')
    ? source.search
    : '';
  const hash = typeof source?.hash === 'string' && source.hash.startsWith('#')
    ? source.hash
    : '';

  return `${pathname}${search}${hash}`;
}

/* -------------------------------------------------------------------------- */
/* Viewport + preference                                                      */
/* -------------------------------------------------------------------------- */

/** True when the viewport is narrower than the mobile breakpoint. */
export function isMobileViewport(viewportWidth?: number): boolean {
  const width =
    typeof viewportWidth === 'number'
      ? viewportWidth
      : typeof window === 'undefined'
        ? MOBILE_BREAKPOINT
        : window.innerWidth;
  return width < MOBILE_BREAKPOINT;
}

/** Reads the persisted workspace preference, defaulting to `mobile`. */
export function readWorkspacePreference(): WorkspacePref {
  if (typeof window === 'undefined' || !window.localStorage) return 'mobile';
  try {
    const stored = window.localStorage.getItem(WORKSPACE_PREF_STORAGE_KEY);
    return stored === 'desktop' ? 'desktop' : 'mobile';
  } catch {
    return 'mobile';
  }
}

/** Persists the workspace preference. Never throws. */
export function writeWorkspacePreference(preference: WorkspacePref): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(WORKSPACE_PREF_STORAGE_KEY, preference);
  } catch {
    /* storage unavailable — preference simply does not persist */
  }
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    try {
      window.dispatchEvent(new Event(WORKSPACE_PREF_EVENT));
    } catch {
      /* event dispatch unsupported — the gate re-reads on its next mount */
    }
  }
}

/**
 * Subscribes to workspace preference changes.
 *
 * Returns an unsubscribe function.
 */
export function subscribeWorkspacePreference(listener: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
    return () => undefined;
  }
  window.addEventListener(WORKSPACE_PREF_EVENT, listener);
  return () => window.removeEventListener(WORKSPACE_PREF_EVENT, listener);
}

/* -------------------------------------------------------------------------- */
/* Mobile URL <-> route                                                       */
/* -------------------------------------------------------------------------- */

/** Builds the mobile workspace URL for an internal route. */
export function buildMobilePath(route: MobileRoute): string {
  switch (route.name) {
    case 'today':
      return `${MOBILE_ROOT}/today`;
    case 'work': {
      // A task id wins over a filter — `/m/work/<taskId>` is the deep link.
      if (route.taskId) return `${MOBILE_ROOT}/work/${encodeURIComponent(route.taskId)}`;
      return route.initialFilter && route.initialFilter !== 'today'
        ? `${MOBILE_ROOT}/work/${route.initialFilter}`
        : `${MOBILE_ROOT}/work`;
    }
    case 'people':
      return `${MOBILE_ROOT}/people`;
    case 'more':
      return `${MOBILE_ROOT}/more`;
    case 'messages':
      return route.threadId
        ? `${MOBILE_ROOT}/messages/${encodeURIComponent(route.threadId)}`
        : `${MOBILE_ROOT}/messages`;
    case 'lead_form':
      return route.mode === 'create'
        ? `${MOBILE_ROOT}/lead/new`
        : `${MOBILE_ROOT}/lead/${encodeURIComponent(route.leadId ?? '')}/edit`;
    case 'entity_profile':
      return `${MOBILE_ROOT}/people/${route.entityType}/${encodeURIComponent(route.entityId)}`;
    case 'customer_edit':
      return `${MOBILE_ROOT}/customer/${encodeURIComponent(route.customerId)}/edit`;
    case 'professional_edit':
      return `${MOBILE_ROOT}/professional/${encodeURIComponent(route.professionalId)}/edit`;
    case 'full_crm_handoff':
      return `${MOBILE_ROOT}/handoff/${encodeURIComponent(route.targetCode)}`;
    default:
      return `${MOBILE_ROOT}/today`;
  }
}

/**
 * Parses a `/m/*` pathname into an internal route.
 *
 * Returns `null` for anything that is not a mobile workspace URL, so callers
 * can fall back to the desktop router without ambiguity.
 */
export function parseMobilePath(pathname: string): MobileRoute | null {
  if (typeof pathname !== 'string') return null;
  if (pathname === MOBILE_ROOT) return { name: 'today' };
  if (!pathname.startsWith(`${MOBILE_ROOT}/`)) {
    return null;
  }
  const segments = pathname
    .slice(MOBILE_ROOT.length + 1)
    .split('/')
    .filter((segment) => segment.length > 0)
    .map((segment) => safeDecodeURIComponent(segment));

  if (segments.length === 0) return { name: 'today' };

  const [head, ...rest] = segments;

  switch (head) {
    case 'today':
      return { name: 'today' };
    case 'more':
      return { name: 'more' };
    case 'work':
      if (rest.length === 0) return { name: 'work' };
      if (rest.length === 1) {
        const segment = rest[0];
        // The five reserved filter tokens are work-list filters; anything else
        // below /m/work/ is a task id.
        if (isWorkFilterToken(segment)) {
          return { name: 'work', initialFilter: segment };
        }
        return { name: 'work', taskId: segment };
      }
      return { name: 'work' };
    case 'people':
      if (rest.length === 0) return { name: 'people' };
      if (rest.length === 1) {
        const filter = rest[0];
        if (filter === 'leads' || filter === 'customers' || filter === 'professionals' || filter === 'recent') {
          return { name: 'people', initialFilter: filter };
        }
        return { name: 'people' };
      }
      if (rest.length === 2) {
        const entityType = rest[0];
        const entityId = rest[1];
        if (
          entityType === 'lead' ||
          entityType === 'customer' ||
          entityType === 'professional'
        ) {
          return { name: 'entity_profile', entityType, entityId };
        }
      }
      return { name: 'people' };
    case 'messages':
      return { name: 'messages', threadId: rest.length > 0 ? rest[0] : null };
    case 'lead':
      if (rest.length === 1 && rest[0] === 'new') {
        return { name: 'lead_form', mode: 'create' };
      }
      if (rest.length === 2 && rest[1] === 'edit') {
        return { name: 'lead_form', mode: 'edit', leadId: rest[0] };
      }
      return null;
    case 'customer':
      if (rest.length === 2 && rest[1] === 'edit') {
        return { name: 'customer_edit', customerId: rest[0] };
      }
      return null;
    case 'professional':
      if (rest.length === 2 && rest[1] === 'edit') {
        return { name: 'professional_edit', professionalId: rest[0] };
      }
      return null;
    case 'handoff':
      if (rest.length === 0) return null;
      return {
        name: 'full_crm_handoff',
        targetLabel: 'Full CRM',
        targetCode: rest.join('/'),
      };
    default:
      return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Desktop URL <-> mobile URL                                                 */
/* -------------------------------------------------------------------------- */

/** Desktop section a mobile entity profile maps back to. */
function desktopSectionForEntity(entityType: 'lead' | 'customer' | 'professional'): string {
  if (entityType === 'customer') return '/customers';
  if (entityType === 'professional') return '/professionals';
  return '/leads';
}

/**
 * Maps a desktop CRM URL onto the equivalent mobile workspace URL.
 *
 * `/leads?view=abc`         → `/m/people/lead/abc`
 * `/professionals?view=abc` → `/m/people/professional/abc`
 * `/customers?view=abc`     → `/m/people/customer/abc`
 * `/tasks?view=abc`         → `/m/work/abc`
 *
 * Returns `null` when the desktop URL has no mobile equivalent, and never
 * returns a `/m/*` URL for an input that is already inside `/m` — that is what
 * keeps the two sides from redirecting into each other forever.
 */
export function mapDesktopPathToMobile(pathname: string, search?: string): string | null {
  if (typeof pathname !== 'string' || pathname.length === 0) return null;
  if (pathname === MOBILE_ROOT || pathname.startsWith(`${MOBILE_ROOT}/`)) return null;

  const params = new URLSearchParams(search ?? '');
  const viewId = params.get('view');

  const normalized = pathname.replace(/\/+$/, '') || '/';

  if (normalized === '/leads') {
    return viewId ? `${MOBILE_ROOT}/people/lead/${encodeURIComponent(viewId)}` : `${MOBILE_ROOT}/people/leads`;
  }
  if (normalized === '/customers') {
    return viewId ? `${MOBILE_ROOT}/people/customer/${encodeURIComponent(viewId)}` : `${MOBILE_ROOT}/people/customers`;
  }
  if (normalized === '/professionals') {
    return viewId
      ? `${MOBILE_ROOT}/people/professional/${encodeURIComponent(viewId)}`
      : `${MOBILE_ROOT}/people/professionals`;
  }
  if (normalized === '/tasks') {
    return viewId ? `${MOBILE_ROOT}/work/${encodeURIComponent(viewId)}` : `${MOBILE_ROOT}/work`;
  }
  if (normalized === '/messages') {
    return `${MOBILE_ROOT}/messages`;
  }
  if (normalized === '/') {
    return `${MOBILE_ROOT}/today`;
  }
  return null;
}

/**
 * Maps a mobile workspace URL back onto the equivalent desktop CRM URL.
 *
 * `/m/people/lead/abc` → `/leads?view=abc`
 * `/m/work/abc`        → `/tasks?view=abc`
 *
 * Returns `null` for mobile URLs with no desktop equivalent.
 */
export function mapMobilePathToDesktop(pathname: string): string | null {
  if (typeof pathname !== 'string' || !pathname.startsWith(`${MOBILE_ROOT}/`)) {
    return null;
  }
  const route = parseMobilePath(pathname);
  if (!route) return null;

  switch (route.name) {
    case 'entity_profile': {
      const section = desktopSectionForEntity(route.entityType);
      return `${section}?view=${encodeURIComponent(route.entityId)}`;
    }
    case 'work': {
      const segments = pathname.split('/').filter(Boolean);
      const segment = segments[2];
      if (!segment) return '/tasks';
      const decoded = safeDecodeURIComponent(segment);
      // A reserved filter token is not a task id — it maps back to the plain
      // task list, while a real task id keeps the `?view=` deep link.
      if (isWorkFilterToken(decoded)) return '/tasks';
      return `/tasks?view=${encodeURIComponent(decoded)}`;
    }
    case 'people': {
      if (route.initialFilter === 'customers') return '/customers';
      if (route.initialFilter === 'professionals') return '/professionals';
      return '/leads';
    }
    case 'today':
      return '/';
    case 'messages':
      return '/messages';
    case 'lead_form':
      return route.mode === 'create' ? '/leads' : `/leads?view=${encodeURIComponent(route.leadId ?? '')}`;
    case 'customer_edit':
      return `/customers?view=${encodeURIComponent(route.customerId)}`;
    case 'professional_edit':
      return `/professionals?view=${encodeURIComponent(route.professionalId)}`;
    case 'more':
      return '/';
    case 'full_crm_handoff':
      return null;
    default:
      return null;
  }
}
